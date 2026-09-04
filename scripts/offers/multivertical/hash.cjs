"use strict";

const { createHash } = require("crypto");

function canonicalValue(value) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_number");
    return JSON.stringify(value);
  }
  if (type === "boolean" || type === "string") return JSON.stringify(value);
  if (type !== "object") throw new Error(`unsupported_type:${type}`);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalValue(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
}

function digestCanonical(value) {
  return `sha256:${createHash("sha256").update(canonicalValue(value), "utf8").digest("hex")}`;
}

function withoutHashFields(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const copy = { ...record };
  delete copy.content_hash;
  delete copy.catalog_hash;
  delete copy.taxonomy_hash;
  return copy;
}

function hashRecord(record) {
  return digestCanonical(withoutHashFields(record));
}

module.exports = {
  canonicalValue,
  digestCanonical,
  hashRecord,
  withoutHashFields,
};
