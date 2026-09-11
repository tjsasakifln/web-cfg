/**
 * Isolated adversarial fixtures. Producer branches are not modified.
 * Control uses shipped units; mutation uses local copies only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { FAIL, PASS } from "./lib/harness.mjs";
import { CORE_IDS } from "./matrix.mjs";
import { receiptImpliesPersist, piiHitsInProps, unknownTreatedAsDefect } from "./checks.mjs";
import * as html from "./lib/html.mjs";
import {
  leadEvent,
  loadEventContract,
  loadLead,
  loadReadiness,
  validLead,
} from "./lib/shipped.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");

function mutationRow(id, { controlPass, mutationDetected, detail }) {
  return {
    id,
    control: controlPass ? PASS : FAIL,
    mutation: mutationDetected ? FAIL : PASS,
    detected: Boolean(controlPass && mutationDetected),
    detail,
  };
}

export async function runMutations(root) {
  const rows = [];
  const require = createRequire(path.join(here, "mutations.mjs"));

  // 1) recibo antes de persistir
  {
    process.env.NODE_ENV = "test";
    const { handler, setStoreForTests, MemoryStore, _reset } = loadLead(root);
    const mem = new MemoryStore();
    setStoreForTests(mem);
    _reset();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
    let controlPass = false;
    try {
      const res = await handler(leadEvent(validLead({ telefone: "48999992201" }), "POST", { ip: "198.51.100.21" }));
      const stored = await mem.get(JSON.parse(res.body).lead_id);
      const v = receiptImpliesPersist(res, stored);
      controlPass = v.claims && v.persisted && res.statusCode === 201;
    } finally {
      globalThis.fetch = originalFetch;
    }
    const fake = require("./fixtures/adversarial/receipt-before-persist.cjs");
    const empty = { get: async () => null };
    const mutated = await fake.handler();
    const mv = receiptImpliesPersist(mutated, await empty.get("lead-unpersisted-receipt"));
    const mutationDetected = mv.claims && !mv.persisted;
    rows.push(
      mutationRow("recibo_antes_de_persistir", {
        controlPass,
        mutationDetected,
        detail: { control201: controlPass, mutationClaimsWithoutStore: mutationDetected },
      }),
    );
  }

  // 2) dado de teste publicado
  {
    const controlHtml = fs.readFileSync(
      path.join(root, "casos/medicao-glosa-demonstrativo/index.html"),
      "utf8",
    );
    const mutatedHtml = fs.readFileSync(path.join(fixtures, "adversarial/published-test-data.html"), "utf8");
    const controlPass = html.publishedTestDataHits(controlHtml).length === 0 && !html.labelsSampleAsClient(controlHtml);
    const mutationDetected =
      html.publishedTestDataHits(mutatedHtml).length > 0 || html.labelsSampleAsClient(mutatedHtml);
    rows.push(
      mutationRow("dado_de_teste_publicado", {
        controlPass,
        mutationDetected,
        detail: {
          controlHits: html.publishedTestDataHits(controlHtml),
          mutationHits: html.publishedTestDataHits(mutatedHtml),
        },
      }),
    );
  }

  // 3) dependência de prova ausente
  {
    const controlHtml = fs.readFileSync(path.join(fixtures, "control/sample-with-ids.html"), "utf8");
    const mutatedHtml = fs.readFileSync(path.join(fixtures, "adversarial/missing-proof.html"), "utf8");
    const controlPass = html.hasCalculationIds(controlHtml);
    const mutationDetected = !html.hasCalculationIds(mutatedHtml);
    rows.push(
      mutationRow("dependencia_de_prova_ausente", {
        controlPass,
        mutationDetected,
        detail: { controlHasIds: controlPass, mutationMissingIds: mutationDetected },
      }),
    );
  }

  // 4) link obrigatório quebrado
  {
    const controlRel = "quantitativos-orcamento-obras/index.html";
    const controlHtml = fs.readFileSync(path.join(root, controlRel), "utf8");
    const mutatedHtml = fs.readFileSync(path.join(fixtures, "adversarial/broken-required-link.html"), "utf8");
    const destExists = (href, baseRoot) => {
      if (!href.startsWith("/")) return true;
      const dest = href.split("#")[0].split("?")[0];
      const file = dest === "/" ? "index.html" : `${dest.replace(/^\//, "").replace(/\/$/, "")}/index.html`;
      return fs.existsSync(path.join(baseRoot, file));
    };
    const controlBroken = html.requiredCtaHrefs(controlHtml).filter((h) => h.startsWith("/") && !destExists(h, root));
    const mutationBroken = html
      .requiredCtaHrefs(mutatedHtml)
      .filter((h) => h.startsWith("/") && !destExists(h, root));
    rows.push(
      mutationRow("link_obrigatorio_quebrado", {
        controlPass: controlBroken.length === 0,
        mutationDetected: mutationBroken.length > 0,
        detail: { controlBroken, mutationBroken },
      }),
    );
  }

  // 5) dado pessoal em evento
  {
    const contract = loadEventContract(root);
    const admitted = contract.admitEvent({
      event: "page_view",
      props: { page_path: "/", email: "pii@example.com", nome: "Pessoa" },
    });
    const props = (admitted.event && admitted.event.props) || admitted.props || {};
    const controlHits = piiHitsInProps(contract, props);
    const passthrough = require("./fixtures/adversarial/pii-passthrough.cjs");
    const leaked = passthrough.admitPassthrough({
      event: "page_view",
      props: { page_path: "/", email: "pii@example.com", nome: "Pessoa" },
    });
    const mutationHits = piiHitsInProps(contract, leaked.props);
    rows.push(
      mutationRow("dado_pessoal_em_evento", {
        controlPass: controlHits.length === 0,
        mutationDetected: mutationHits.length > 0,
        detail: { controlHits, mutationHits },
      }),
    );
  }

  // 6) conclusão errada para desconhecido
  {
    const E = loadReadiness(root);
    const result = E.diagnosePrivateProjectTechnicalReadiness(E.emptyAnswers());
    const controlPass = !unknownTreatedAsDefect(result);
    const fake = require("./fixtures/adversarial/unknown-as-defect.cjs");
    const mutated = fake.classifyUnknownAsDefect(E.emptyAnswers());
    const mutationDetected = unknownTreatedAsDefect(mutated);
    rows.push(
      mutationRow("conclusao_errada_para_desconhecido", {
        controlPass,
        mutationDetected,
        detail: { controlUnknown: result.unknown_count, mutationStatus: mutated.status },
      }),
    );
  }

  {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtures, "adversarial/core-manifest-omit.json"), "utf8"),
    );
    const omitted = CORE_IDS.filter((id) => !(manifest.campaigns || []).includes(id));
    rows.push(
      mutationRow("core_manifest_omit", {
        controlPass: CORE_IDS.includes("03") && CORE_IDS.length === 10,
        mutationDetected: omitted.includes("03"),
        detail: { omitted },
      }),
    );
  }

  return rows;
}
