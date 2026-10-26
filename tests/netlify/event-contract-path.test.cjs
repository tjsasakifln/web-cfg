"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const contract = require("../../netlify/functions/lib/event-contract.cjs");
const collect = require("../../netlify/functions/collect.cjs");

function event(overrides = {}) {
  const { props = {}, ...rest } = overrides;
  return {
    event: "page_view",
    ...rest,
    props: { asset_id: "home", ...props },
  };
}

test("analytics paths redact repeatedly encoded PII without changing safe encoded routes", () => {
  const encodedPiiPaths = [
    "/contato/ana%40example.test/",
    "/contato/ana%2540example.test/",
    "/contato/ana%252540example.test/",
    "/contato/%35%35%34%38%39%39%39%39%39%39%39%39%39/",
  ];

  for (const path of encodedPiiPaths) {
    const topLevel = contract.admitEvent(event({ path }));
    assert.equal(topLevel.ok, true, path);
    assert.equal(topLevel.event.path, "/[redacted]", path);
    assert.equal(JSON.stringify(topLevel.event).includes(path), false, path);

    const propPath = contract.admitEvent(event({ props: { page_path: path } }));
    assert.equal(propPath.ok, true, path);
    assert.equal(propPath.event.path, "/[redacted]", path);
    assert.equal(propPath.event.props.page_path, "/[redacted]", path);
    assert.equal(JSON.stringify(propPath.event).includes(path), false, path);
  }

  const safe = contract.admitEvent(event({
    path: "/conteudos/medi%C3%A7%C3%A3o-de-obra",
    props: { page_path: "/conteudos/medi%C3%A7%C3%A3o-de-obra" },
  }));
  assert.equal(safe.ok, true);
  assert.equal(safe.event.path, "/conteudos/medi%C3%A7%C3%A3o-de-obra/");
  assert.equal(safe.event.props.page_path, "/conteudos/medi%C3%A7%C3%A3o-de-obra/");
});

test("analytics paths strip query and fragment before persistence", () => {
  const admitted = contract.admitEvent(event({
    path: "/contato?email=ana%40example.test#mensagem",
    props: { page_path: "/contato?email=ana%40example.test#mensagem" },
  }));
  assert.equal(admitted.ok, true);
  assert.equal(admitted.event.path, "/contato/");
  assert.equal(admitted.event.props.page_path, "/contato/");
  assert.equal(JSON.stringify(admitted.event).includes("example.test"), false);
});

test("analytics paths reject ambiguous or malformed path syntax", () => {
  const invalidPaths = [
    "//tracker.example/collect",
    "/\\tracker.example/collect",
    "/contato%0Asegmento",
    "/percentual%",
    "https://tracker.example/collect",
    "/%2Ftracker.example/collect",
  ];
  for (const path of invalidPaths) {
    const topLevel = contract.admitEvent(event({ path }));
    assert.equal(topLevel.ok, false, path);
    assert.equal(topLevel.reason, "invalid_path", path);

    const propPath = contract.admitEvent(event({ props: { page_path: path } }));
    assert.equal(propPath.ok, false, path);
    assert.equal(propPath.reason, "invalid_path", path);
  }
});

test("encoded PII in any other analytics string property fails closed", () => {
  for (const topic of [
    "ana%40example.test",
    "ana%2540example.test",
    "ana%40example.test%ZZ",
    "ana%2525252540example.test",
    "%35%35%34%38%39%39%39%39%39%39%39%39%39",
  ]) {
    const admitted = contract.admitEvent(event({ props: { topic } }));
    assert.equal(admitted.ok, false, topic);
    assert.equal(admitted.reason, "pii_value", topic);
  }
});

test("collector never buffers encoded path PII", async () => {
  const encodedEmail = "/contato/ana%252540example.test/";
  const response = await collect.handler({
    httpMethod: "POST",
    headers: { origin: "https://confenge.com.br", "content-type": "application/json" },
    body: JSON.stringify({ events: [event({ path: encodedEmail })] }),
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 202);
  assert.equal(body.accepted, 1);
  const persisted = collect._recent().at(-1);
  assert.equal(persisted.path, "/[redacted]");
  assert.equal(JSON.stringify(persisted).includes("example.test"), false);
  assert.equal(JSON.stringify(persisted).includes("%252540"), false);
});
