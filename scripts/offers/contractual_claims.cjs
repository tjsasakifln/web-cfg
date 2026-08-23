/**
 * Build-time contractual copy derived from the versioned offer snapshot.
 *
 * The checked-in HTML remains deployable as a static file, while the generated
 * block makes snapshot drift fail closed. Run with --write to refresh the block
 * after an authoritative catalog change; --check never mutates files.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "offers", "catalog.snapshot.json");

const CLAIMS = Object.freeze([
  Object.freeze({
    id: "diagnostico-expansao-delivery-sla",
    offer_id: "CFG-DIAG-EXP-v1",
    file: "diagnostico-b2g-expansao/index.html",
    render(offer) {
      const sla = formatBusinessDayInterval(offer.sla_business_days);
      return `<p class="content-lead" data-contractual-sla="${offer.offer_id}">R$ 8.000, pagamento único. Prazo de entrega: ${sla} depois do aceite, da confirmação financeira, do recebimento dos dados necessários e da reunião inicial ou dispensa escrita.</p>`;
    },
  }),
]);

function parseBusinessDayInterval(raw) {
  const match = String(raw || "").trim().match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
  if (!match) throw new Error(`invalid sla_business_days interval: ${String(raw)}`);
  const lower = Number(match[1]);
  const upper = Number(match[2]);
  if (!Number.isInteger(lower) || !Number.isInteger(upper) || lower < 1 || upper <= lower) {
    throw new Error(`invalid sla_business_days bounds: ${String(raw)}`);
  }
  return { lower, upper };
}

function formatBusinessDayInterval(raw) {
  const { lower, upper } = parseBusinessDayInterval(raw);
  return `${lower} a ${upper} dias úteis`;
}

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function marker(claim, side) {
  return `<!-- ${side} CONTRACTUAL_CLAIM:${claim.id} -->`;
}

function expectedBlock(claim, offer) {
  return `${marker(claim, "BEGIN")}\n${claim.render(offer)}\n${marker(claim, "END")}`;
}

function replaceBlock(html, claim, replacement) {
  const start = marker(claim, "BEGIN");
  const end = marker(claim, "END");
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end);
  if (startAt < 0 || endAt < 0 || endAt < startAt) {
    throw new Error(`missing generated claim markers for ${claim.id}`);
  }
  return html.slice(0, startAt) + replacement + html.slice(endAt + end.length);
}

function syncContractualClaims({ write = false } = {}) {
  const snapshot = loadSnapshot();
  const offers = new Map((snapshot.offers || []).map((offer) => [offer.offer_id, offer]));
  const mismatches = [];

  for (const claim of CLAIMS) {
    const offer = offers.get(claim.offer_id);
    if (!offer || !offer.sla_business_days) {
      throw new Error(`authoritative SLA missing for ${claim.offer_id}`);
    }
    const filePath = path.join(ROOT, claim.file);
    const current = fs.readFileSync(filePath, "utf8");
    const expected = expectedBlock(claim, offer);
    const next = replaceBlock(current, claim, expected);
    if (next !== current) {
      mismatches.push({ claim_id: claim.id, offer_id: claim.offer_id, file: claim.file });
      if (write) fs.writeFileSync(filePath, next, "utf8");
    }
  }

  return { ok: mismatches.length === 0 || write, changed: write ? mismatches.length : 0, mismatches };
}

if (require.main === module) {
  const write = process.argv.includes("--write");
  const result = syncContractualClaims({ write });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!write && !result.ok) process.exitCode = 1;
}

module.exports = {
  CLAIMS,
  SNAPSHOT_PATH,
  formatBusinessDayInterval,
  parseBusinessDayInterval,
  syncContractualClaims,
};
