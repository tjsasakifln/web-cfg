import { createHash } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { gunzipSync } from "node:zlib";

const { center, municipalities } = JSON.parse(readFileSync(new URL("./extra-sc-municipalities.json", import.meta.url)));
const borders = JSON.parse(gunzipSync(readFileSync(new URL("./extra-sc-border.json.gz", import.meta.url))));
const day = 86_400_000;
const maxAge = day;
const assemblyAge = 30 * 60_000;
const maxBytes = 2 * 1024 * 1024;
const maxRows = 1000;
const hash = (input) => createHash("sha256").update(input).digest("hex");
const families = {
  edificacoes: "Edificações públicas",
  viaria: "Infraestrutura viária",
  saneamento: "Drenagem e saneamento",
  especiais: "Obras especiais",
  outras_obras: "Outras obras",
};
const types = ["decidir", "antecipar", "preparar"];
const docKinds = ["edital", "termo_referencia", "projeto", "contrato", "aditivo", "ato_oficial"];
const error = (code, status) => Object.assign(new Error(code), { code, status });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, max = 1_000_000_000_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const text = (value, limit = 230) => typeof value === "string" && value.length <= limit &&
  value.trim() && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value) ? value.trim() : null;
const keyPattern = /^[a-z0-9][a-z0-9_.:-]{0,119}$/i;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().startsWith(value) ? value : null;
const moment = (value) => typeof value === "string" && iso.test(value) && dateOnly(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const inPast = (value, now) => moment(value) !== null && moment(value) <= now;
const activeTimestamp = (value, now, limit) => inPast(value, now) && now - moment(value) <= limit;
const localDay = (now) => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(now);

function officialUrl(value) {
  if (!text(value, 900)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (host === "pncp.gov.br" || host === "www.gov.br" || host === "api.pncp.gov.br" || host.endsWith(".sc.gov.br")) &&
      url.pathname !== "/" ? url.href : null;
  } catch { return null; }
}

function documentEvidence(value) {
  if (!isObject(value) || !docKinds.includes(value.kind) || !/^[a-f0-9]{64}$/.test(value.sha256 || "")) return null;
  const url = officialUrl(value.url);
  const locator = text(value.locator, 140);
  return url && locator ? { kind: value.kind, url, locator } : null;
}

const rad = (x) => x * Math.PI / 180;
function km(lon, lat) {
  const a = Math.sin(rad(lat - center.lat) / 2) ** 2 +
    Math.cos(rad(lat)) * Math.cos(rad(center.lat)) * Math.sin(rad(lon - center.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(a));
}

// An explicit execution document is required even for municipalities wholly in the
// radius. A centroid, agency address or a mention in the title is never proof.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideMargin(lon, lat, polygons, uncertaintyM) {
  const xScale = 111_200 * Math.cos(rad(lat));
  const yScale = 111_200;
  const threshold = uncertaintyM + 100; // rounding and territorial mesh tolerance
  const farFromRing = (ring) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = [(ring[j][0] - lon) * xScale, (ring[j][1] - lat) * yScale];
      const [dx, dy] = [(ring[i][0] - ring[j][0]) * xScale, (ring[i][1] - ring[j][1]) * yScale];
      const factor = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      if (Math.hypot(ax + factor * dx, ay + factor * dy) <= threshold) return false;
    }
    return true;
  };
  return polygons.some(([outer, ...holes]) => inRing(lon, lat, outer) && farFromRing(outer) &&
    holes.every((r) => !inRing(lon, lat, r) && farFromRing(r)));
}

export function territory(input) {
  if (!isObject(input) || input.basis !== "all_execution_sites" || !Array.isArray(input.sites) ||
    input.sites.length === 0 || input.sites.length > 100) return { result: "local_sem_prova" };
  const sites = [];
  const unresolved = [];
  for (const site of input.sites) {
    const evidence = documentEvidence(site?.evidence);
    const code = site?.code;
    if (!evidence || typeof code !== "string" || !/^\d{7}$/.test(code)) {
      unresolved.push("local_sem_prova"); continue;
    }
    if (!code.startsWith("42")) return { result: "fora_do_territorio" };
    if (!Object.hasOwn(municipalities, code)) {
      unresolved.push("local_sem_prova"); continue;
    }
    const [city, min, max] = municipalities[code];
    if (min > 200) return { result: "fora_do_territorio" };
    if (max <= 200) {
      sites.push({ code, city, kmMax: max, evidence }); continue;
    }
    const { lon, lat, uncertaintyM } = site.point || {};
    const geoProof = documentEvidence(site.point?.evidence);
    if (!geoProof || !Number.isFinite(lon) || !Number.isFinite(lat) || !integer(uncertaintyM, 1000) ||
      !borders[code] || !insideMargin(lon, lat, borders[code], uncertaintyM)) {
      unresolved.push("limite_sem_prova"); continue;
    }
    const d = km(lon, lat);
    const bufferKm = 1 + uncertaintyM / 1000;
    if (d - bufferKm > 200) return { result: "fora_do_territorio" };
    if (d + bufferKm > 200) {
      unresolved.push("limite_sem_prova"); continue;
    }
    sites.push({ code, city, kmMax: Math.ceil(d + bufferKm), evidence });
  }
  return unresolved.length ? { result: unresolved.includes("local_sem_prova") ? "local_sem_prova" : "limite_sem_prova" }
    : { result: "confirmado", sites };
}

const amountKinds = {
  estimated: "Estimativa do edital",
  initial: "Valor inicial contratado",
  global: "Valor global contratado",
  amended: "Valor contratual após aditivo",
};

function amount(input, kinds) {
  const evidence = documentEvidence(input?.evidence);
  return evidence && kinds.includes(input?.type) && integer(input?.cents) && input.cents > 0
    ? { label: amountKinds[input.type], cents: input.cents, evidence } : null;
}

const coveragePart = (raw) => isObject(raw) && integer(raw.scanned, 10_000_000) &&
  integer(raw.unreviewed, raw.scanned) && typeof raw.truncated === "boolean" &&
  dateOnly(raw.windowStart) && dateOnly(raw.windowEnd) && raw.windowStart <= raw.windowEnd
  ? { scanned: raw.scanned, unreviewed: raw.unreviewed, truncated: raw.truncated,
    windowStart: raw.windowStart, windowEnd: raw.windowEnd } : null;

function requireEnvelope(raw, now) {
  if (!isObject(raw) || raw.schema !== "confenge.extra-intelligence/v1" || raw.producer !== "extra-cli" ||
    raw.mode !== "OFFICIAL_LIVE" || raw.scope !== "extra-sc-sao-jose-200/v1" ||
    !inPast(raw.generatedAt, now) || !inPast(raw.sourceCut, moment(raw.generatedAt)) ||
    !coveragePart(raw.coverage?.notices) || !coveragePart(raw.coverage?.contracts) ||
    !Array.isArray(raw.records) || raw.records.length > maxRows) throw error("intelligence_invalid", 503);
  return raw;
}

function assess(row, now, cut, stale) {
  const id = row?.key;
  if (typeof id !== "string" || !keyPattern.test(id) || !["notice", "contract"].includes(row.kind)) return { reason: "registro_invalido" };
  const title = text(row.title, 500);
  const buyer = text(row.buyer);
  const buyerKey = typeof row.buyerKey === "string" && keyPattern.test(row.buyerKey) ? row.buyerKey : null;
  const official = officialUrl(row.officialUrl);
  const scopeEvidence = documentEvidence(row.scopeEvidence);
  if (!title || !buyer || !buyerKey || !official) return { reason: "registro_invalido" };
  if (!Object.hasOwn(families, row.family) || !scopeEvidence || row.physicalWork !== true) return { reason: "escopo_sem_prova" };
  const { result, sites } = territory(row.execution);
  if (result !== "confirmado") return { reason: result };
  const common = { id, title, buyer, buyerKey, official, scopeEvidence, family: row.family, sites };
  if (row.kind === "notice") {
    const n = row.notice;
    const closes = moment(n?.closesAt);
    const opens = moment(n?.opensAt);
    if (n?.state !== "open" || closes === null || opens === null || opens >= closes ||
      opens > now || closes <= now || stale || !inPast(n.statusVerifiedAt, cut) ||
      moment(n.statusVerifiedAt) < opens || !activeTimestamp(n.statusVerifiedAt, now, maxAge) ||
      !documentEvidence(n.evidence)) return { reason: "edital_nao_confirmado" };
    return { view: "decidir", row: {
      ...common, closesAt: n.closesAt, statusVerifiedAt: n.statusVerifiedAt, statusEvidence: documentEvidence(n.evidence),
      amount: amount(n.amount, ["estimated"]), firstCheck: text(n.firstCheck, 240) || "Conferir habilitação técnica e capacidade de execução.",
    } };
  }
  const c = row.contract;
  if (!dateOnly(c?.publishedOn) || c.publishedOn > localDay(cut)) return { reason: "registro_invalido" };
  const endsOn = dateOnly(c.endsOn);
  const daysUntilEnd = endsOn ? Math.round((Date.parse(endsOn) - Date.parse(localDay(now))) / day) : null;
  const endEvidence = documentEvidence(c.endEvidence);
  const active = !stale && c.state === "active_proven" && c.endConflict === false && endsOn &&
    endsOn >= c.publishedOn && daysUntilEnd >= 0 && daysUntilEnd <= 180 &&
    inPast(c.statusVerifiedAt, cut) && activeTimestamp(c.statusVerifiedAt, now, 7 * day) && endEvidence;
  return { view: "preparar", active: Boolean(active), row: {
    ...common, publishedOn: c.publishedOn, contractor: text(c.contractor), comparison: text(c.comparison, 240),
    amount: amount(c.amount, ["initial", "global", "amended"]),
    ...(active ? { endsOn, daysUntilEnd, endEvidence } : {}),
  } };
}

export function intelligenceView(input, { now = Date.now(), family = "" } = {}) {
  const snapshot = requireEnvelope(input, now);
  if (family && !Object.hasOwn(families, family)) throw error("intelligence_invalid_filter", 422);
  const cut = moment(snapshot.sourceCut);
  const stale = !activeTimestamp(snapshot.generatedAt, now, assemblyAge) || !activeTimestamp(snapshot.sourceCut, now, assemblyAge);
  const deciding = [];
  const preparing = [];
  const watch = [];
  const reasonCounts = Object.create(null);
  const keys = new Map();
  const urlKeys = new Map();
  for (const row of snapshot.records) {
    if (!isObject(row)) continue;
    const key = typeof row.key === "string" ? row.key.toLowerCase() : "";
    const url = officialUrl(row.officialUrl)?.split("#")[0].split("?")[0];
    keys.set(key, (keys.get(key) || 0) + 1);
    if (url) urlKeys.set(url, (urlKeys.get(url) || 0) + 1);
  }
  for (const candidate of snapshot.records) {
    const url = officialUrl(candidate?.officialUrl)?.split("#")[0].split("?")[0];
    const duplicate = typeof candidate?.key === "string" && keys.get(candidate.key.toLowerCase()) > 1 ||
      url && urlKeys.get(url) > 1;
    const observation = duplicate ? { reason: "identidade_em_conflito" } : assess(candidate, now, cut, stale);
    if (observation.reason) {
      reasonCounts[observation.reason] = (reasonCounts[observation.reason] || 0) + 1;
      continue;
    }
    if (family && family !== observation.row.family) continue;
    if (observation.view === "decidir") deciding.push(observation.row);
    else {
      preparing.push(observation.row);
      if (observation.active) watch.push(observation.row);
    }
  }
  const compare = (a, b) => a.localeCompare(b);
  deciding.sort((a, b) => moment(a.closesAt) - moment(b.closesAt) || compare(a.id, b.id));
  preparing.sort((a, b) => compare(b.publishedOn, a.publishedOn) || compare(a.id, b.id));
  watch.sort((a, b) => a.daysUntilEnd - b.daysUntilEnd || compare(a.id, b.id));
  const cohorts = new Map();
  for (const row of preparing) {
    // A shared buyer and family is not enough to call two awards one cycle.
    const key = JSON.stringify([row.buyerKey, row.family, row.sites.map((s) => s.code).sort()]);
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row);
  }
  const display = ({ buyerKey: _buyerKey, ...row }) => row;
  const result = {
    generatedAt: snapshot.generatedAt, sourceCut: snapshot.sourceCut, stale,
    coverage: { notices: coveragePart(snapshot.coverage.notices), contracts: coveragePart(snapshot.coverage.contracts),
      pending: Object.fromEntries(Object.entries(reasonCounts).filter(([key]) => key !== "fora_do_territorio")) },
    families, family,
    decidir: deciding.map(display),
    antecipar: watch.map((row) => ({ ...display(row), history: (cohorts.get(JSON.stringify([
      row.buyerKey, row.family, row.sites.map((s) => s.code).sort(),
    ])) || []).filter((other) => other.id !== row.id).slice(0, 12).reverse()
      .map(({ id, publishedOn, title, official }) => ({ id, publishedOn, title, official })) })),
    preparar: preparing.map(display),
  };
  return { ...result, revision: hash(JSON.stringify(result)) };
}

function csvField(value) {
  const s = String(value ?? "");
  const clean = /^[\s\p{Cf}]*[=+@\-\t\r\n]/u.test(s) ? "'" + s : s;
  return '"' + clean.replaceAll('"', '""') + '"';
}

export function intelligenceCsv(view, tab, revision) {
  if (!types.includes(tab)) throw error("intelligence_invalid_filter", 422);
  if (!/^[a-f0-9]{64}$/.test(revision || "") || view.revision !== revision) throw error("intelligence_revision_changed", 409);
  const rows = [[
    "Fonte", "Corte da base", "Versão da consulta", "Tipo de obra", "Objeto", "Comprador", "Contratado",
    "Local da execução", "Prazo da proposta", "Verificação do edital", "Fim de vigência observado", "Publicação",
    "Valor BRL", "Tipo de valor", "Documento oficial", "Trecho que confirma o local", "Documento da vigência",
    "Primeira verificação", "Base atrasada",
  ], ...view[tab].map((row) => [
    "CONFENGE", view.sourceCut, revision, view.families[row.family], row.title, row.buyer, row.contractor,
    row.sites.map((s) => s.city + "/SC").join(", "), row.closesAt, row.statusVerifiedAt, row.endsOn, row.publishedOn,
    row.amount ? (row.amount.cents / 100).toFixed(2).replace(".", ",") : "", row.amount?.label, row.official,
    row.sites.map((s) => s.evidence.url + " (" + s.evidence.locator + ")").join(" | "), row.endEvidence?.url,
    row.firstCheck || row.comparison, view.stale ? "Sim" : "Não",
  ])];
  return "\ufeff" + rows.map((row) => row.map(csvField).join(";")).join("\r\n") + "\r\n";
}

export function createIntelligenceReader(filename) {
  if (typeof filename !== "string" || !isAbsolute(filename)) return null;
  let last;
  return async ({ now, family }) => {
    let handle;
    try {
      handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await handle.stat({ bigint: true });
      if (!stat.isFile() || stat.size <= 0n || stat.size > BigInt(maxBytes) || stat.mode & 0o022n) {
        throw error("intelligence_invalid", 503);
      }
      const id = [stat.dev, stat.ino, stat.mtimeNs, stat.ctimeNs, stat.size].join(":");
      if (last?.id !== id) {
        const buf = Buffer.alloc(Number(stat.size));
        let offset = 0;
        while (offset < buf.length) {
          const { bytesRead } = await handle.read(buf, offset, buf.length - offset, offset);
          if (!bytesRead) throw error("intelligence_invalid", 503);
          offset += bytesRead;
        }
        const raw = JSON.parse(buf);
        requireEnvelope(raw, now);
        last = { id, raw };
      }
      return intelligenceView(last.raw, { now, family });
    } catch (err) {
      if (err?.status === 422) throw err;
      throw error("intelligence_unavailable", 503);
    } finally {
      await handle?.close();
    }
  };
}
