/**
 * Browser copy of diagnose-margin.cjs (same functions).
 */
(function (root) {
  "use strict";
  var module = { exports: {} };
/**
 * Diagnóstico de Defesa de Margem — shipped transform.
 * Official producer facts stay official. Absence is UNKNOWN.
 * No legal/credit fabrication.
 */
const OFFICIAL = "OFFICIAL";
const DERIVED = "DERIVED";
const INFERRED = "INFERRED";
const UNKNOWN = "UNKNOWN";
const MARGIN_DEFENSE_SCHEMA = "public-read-margin-defense/1.0";

const MARGIN_FAMILIES = [
  "aditivo",
  "apostilamento",
  "prorrogacao",
  "suspensao",
  "rescisao",
  "cancelamento",
  "reajuste",
  "reequilibrio",
  "medicao",
  "pagamento",
];

const FORBIDDEN_CLAIMS = [
  "pode ter direito",
  "tem direito",
  "crédito",
  "credito",
  "tese jurídica",
  "tese juridica",
  "parecer vinculante",
  "recuperação garantida",
  "recuperacao garantida",
];

const FORBIDDEN_CONCLUSION_FIELDS = [
  "has_right",
  "imbalance",
  "loss",
  "should_adjust",
  "direito",
  "desequilibrio",
  "perda",
  "deveria_reajustar",
];

const EVENT_FIELD_MAP = {
  aditivo: ["amendments", "value_changes"],
  apostilamento: ["scope_changes"],
  prorrogacao: ["term_changes", "extension"],
  suspensao: ["suspension"],
  rescisao: [],
  cancelamento: [],
  reajuste: [],
  reequilibrio: [],
  medicao: ["measurement_events"],
  pagamento: ["payment_events"],
};

function present(value) {
  if (value == null) return false;
  if (typeof value === "string" && !value.trim()) return false;
  if (Array.isArray(value) && !value.length) return false;
  if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
  return true;
}

function fact(field, classification, value, extra) {
  const row = {
    field,
    classification,
    value: classification === UNKNOWN ? null : value,
    source: extra && extra.source != null ? extra.source : null,
    source_uri: extra && extra.source_uri != null ? extra.source_uri : null,
    as_of: extra && extra.as_of != null ? extra.as_of : null,
    provenance: extra && extra.provenance != null ? extra.provenance : null,
    confidence: extra && extra.confidence != null ? extra.confidence : null,
    reason: extra && extra.reason != null ? extra.reason : null,
  };
  if (extra && extra.derived_from) row.derived_from = extra.derived_from;
  if (extra && extra.qualifier) row.qualifier = extra.qualifier;
  if (extra && extra.evidence_ref) row.evidence_ref = extra.evidence_ref;
  return row;
}

function hasOfficialBacking(record) {
  return Boolean(
    present(record && record.source) &&
      present(record && record.as_of) &&
      present(record && record.provenance),
  );
}

function missingReason(record, field, fallback) {
  return (record && record._missing_reasons && record._missing_reasons[field]) || fallback;
}

function official(field, value, record, extra) {
  if (!present(value)) {
    return fact(field, UNKNOWN, null, {
      reason: (extra && extra.missing_reason) || missingReason(record, field, "producer_field_absent"),
      as_of: record && record.as_of,
      provenance: record && record.provenance,
    });
  }
  if (!hasOfficialBacking(record)) {
    return fact(field, UNKNOWN, null, {
      reason: "missing_source_provenance_or_as_of",
      as_of: record && record.as_of,
      provenance: record && record.provenance,
    });
  }
  return fact(field, OFFICIAL, value, {
    source: record.source,
    source_uri: record.source_uri,
    as_of: record.as_of,
    provenance: record.provenance,
    confidence: record.uncertainty === true ? 0.6 : 0.85,
    qualifier: extra && extra.qualifier,
    evidence_ref: record.evidence_ref || null,
  });
}

function producerField(record, name) {
  const fields = record && record.fields;
  if (!fields || typeof fields !== "object") return null;
  return fields[name] || null;
}

function isKnownField(field) {
  return Boolean(field && field.status === "KNOWN" && present(field.value));
}

function knownValue(record, name) {
  const field = producerField(record, name);
  return isKnownField(field) ? field.value : null;
}

function fieldReason(record, name, fallback) {
  const field = producerField(record, name);
  return (field && field.reason_code) || fallback;
}

function isMarginDefenseRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (!record.fields || typeof record.fields !== "object") return false;
  return record.schema === MARGIN_DEFENSE_SCHEMA || record.canonical_contract_id !== undefined;
}

function httpRef(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

function firstEvidenceRef(record) {
  if (httpRef(record.evidence_ref)) return record.evidence_ref;
  const fields = record.fields || {};
  for (const name of Object.keys(fields)) {
    const ref = fields[name] && fields[name].evidence_ref;
    if (present(ref)) return ref;
  }
  return record.source_record_id || record.source_id || null;
}

function slugFromId(id) {
  const raw = String(id || "");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `md-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertNoConclusionFields(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_CONCLUSION_FIELDS.indexOf(key) !== -1) {
      throw new Error(`forbidden_conclusion_field:${key}`);
    }
  }
}

function normalizeMarginDefenseRecord(record, snapshot) {
  assertNoConclusionFields(record);
  assertNoConclusionFields(record.fields);
  const identity = knownValue(record, "canonical_contract_id") || record.canonical_contract_id || null;
  const organ = knownValue(record, "organ") || {};
  const contractor = knownValue(record, "contractor") || {};
  const nominal = knownValue(record, "nominal_value");
  const signedAmount = nominal && nominal.amount != null ? nominal.amount : null;
  const evidence = firstEvidenceRef(record);
  const source = record.source_id || (snapshot && snapshot.producer) || "extra-cli";
  const asOf = record.as_of || (snapshot && snapshot.as_of) || null;
  const provenance = {
    producer_export: MARGIN_DEFENSE_SCHEMA,
    source_id: record.source_id || null,
    source_record_id: record.source_record_id || identity,
    evidence_ref: evidence,
    dataset_hash: (snapshot && (snapshot.content_hash || snapshot.dataset_hash)) || null,
    snapshot_id: (snapshot && (snapshot.content_hash || snapshot.snapshot_id)) || null,
    observed_at: record.observed_at || null,
    verified_at: asOf,
  };
  const eventReasons = {};
  const marginEvents = [];
  for (const family of MARGIN_FAMILIES) {
    const names = EVENT_FIELD_MAP[family] || [];
    let known = null;
    let reason = null;
    for (const name of names) {
      const field = producerField(record, name);
      if (isKnownField(field)) {
        known = field;
        break;
      }
      if (field && field.reason_code) reason = reason || field.reason_code;
    }
    if (!names.length) {
      reason =
        family === "reajuste"
          ? fieldReason(record, "adjustment_anniversary", "no_explicit_adjustment_document")
          : family === "reequilibrio"
            ? fieldReason(record, "adjustment_base", "no_explicit_adjustment_rule")
            : "not_observed";
    }
    if (known) {
      marginEvents.push({
        family,
        classification: OFFICIAL,
        source,
        source_uri: httpRef(known.evidence_ref),
        as_of: asOf,
        provenance,
        payload: known.value,
        evidence_ref: known.evidence_ref || evidence,
      });
    } else {
      eventReasons[family] = reason || "not_observed";
    }
  }
  const missing = {
    public_id: fieldReason(record, "canonical_contract_id", "missing_identity"),
    process_key: fieldReason(record, "canonical_contract_id", "missing_identity"),
    official_number: fieldReason(record, "canonical_contract_id", "missing_identity"),
    titulo: fieldReason(record, "object", "missing_object"),
    orgao: fieldReason(record, "organ", "missing_organ"),
    fornecedor: fieldReason(record, "contractor", "missing_contractor"),
    uf: "not_in_margin_defense_1_0_fields",
    municipio: "not_in_margin_defense_1_0_fields",
    valor_contratual: fieldReason(record, "nominal_value", "missing_nominal_value"),
    valor_estimado: "estimated_value_not_in_margin_defense_1_0",
    vigencia_inicio: fieldReason(record, "start_at", "missing_start_at"),
    vigencia_fim: fieldReason(record, "end_at", "missing_end_at"),
  };
  const reasonCodes = Array.isArray(record.reason_codes) ? record.reason_codes.slice() : [];
  return {
    public_id: identity,
    process_key: identity,
    official_number: identity,
    public_id_slug: slugFromId(identity),
    title: knownValue(record, "object"),
    contract_value: signedAmount,
    estimated_value: null,
    vigencia_start: knownValue(record, "start_at"),
    vigencia_end: knownValue(record, "end_at"),
    data_assinatura: knownValue(record, "signed_at"),
    term: knownValue(record, "term"),
    organ: {
      display_name: organ.name || null,
      tax_identifier_export: organ.cnpj || null,
      entity_type: "organ",
    },
    supplier: {
      display_name: contractor.name || null,
      tax_identifier_export: contractor.cnpj || null,
      entity_type: "supplier",
    },
    uf: null,
    municipio: null,
    source,
    source_uri: httpRef(evidence),
    evidence_ref: evidence,
    as_of: asOf,
    source_updated_at: record.observed_at || asOf,
    completeness: reasonCodes.length ? "PARTIAL" : "COMPLETE",
    reason_codes: reasonCodes,
    uncertainty: reasonCodes.length > 0,
    provenance,
    margin_events: marginEvents,
    schema: MARGIN_DEFENSE_SCHEMA,
    canonical_contract_id: identity,
    _missing_reasons: missing,
    _event_reasons: eventReasons,
    _producer_fields: record.fields || {},
  };
}

function asConsumerRecord(record, snapshot) {
  return isMarginDefenseRecord(record) ? normalizeMarginDefenseRecord(record, snapshot) : record;
}

function anniversaryFrom(record) {
  const raw = record.data_assinatura || record.vigencia_start;
  if (!present(raw) || !hasOfficialBacking(record)) {
    return fact("aniversario_contratual", UNKNOWN, null, {
      reason: present(raw) ? "missing_source_provenance_or_as_of" : "no_official_start_or_signature_date",
      as_of: record.as_of,
      provenance: record.provenance,
    });
  }
  const date = String(raw).slice(0, 10);
  const parts = date.split("-");
  if (parts.length !== 3) {
    return fact("aniversario_contratual", UNKNOWN, null, {
      reason: "official_date_unparseable",
      as_of: record.as_of,
    });
  }
  return fact("aniversario_contratual", DERIVED, `${parts[1]}-${parts[2]}`, {
    source: record.source,
    source_uri: record.source_uri,
    as_of: record.as_of,
    provenance: record.provenance,
    derived_from: record.data_assinatura ? ["data_assinatura"] : ["vigencia_start"],
    reason: "month_day_of_official_start",
    confidence: 0.7,
  });
}

function classifyEvent(event, record) {
  const family = event && event.family;
  if (!family || MARGIN_FAMILIES.indexOf(family) === -1) {
    return { family: family || "unknown_family", classification: UNKNOWN, reason: "unsupported_or_missing_family" };
  }
  const declared = event.classification;
  if (declared === DERIVED || declared === INFERRED || declared === UNKNOWN) {
    return {
      family,
      classification: declared,
      effective_at: event.effective_at || null,
      published_at: event.published_at || null,
      value_delta: event.value_delta == null ? null : event.value_delta,
      term_delta_days: event.term_delta_days == null ? null : event.term_delta_days,
      source: event.source || null,
      source_uri: event.source_uri || null,
      as_of: event.as_of || record.as_of,
      provenance: event.provenance || record.provenance,
      reason: event.reason || null,
    };
  }
  if (present(event.source) && present(event.provenance || record.provenance) && present(event.as_of || record.as_of)) {
    return {
      family,
      classification: OFFICIAL,
      effective_at: event.effective_at || null,
      published_at: event.published_at || null,
      value_delta: event.value_delta == null ? null : event.value_delta,
      term_delta_days: event.term_delta_days == null ? null : event.term_delta_days,
      source: event.source,
      source_uri: event.source_uri || record.source_uri || null,
      as_of: event.as_of || record.as_of,
      provenance: event.provenance || record.provenance,
      evidence_ref: event.evidence_ref || record.evidence_ref || null,
    };
  }
  return { family, classification: UNKNOWN, reason: "event_missing_source_provenance_or_as_of", as_of: record.as_of };
}

function emptyEvent(family, record) {
  const reason =
    (record && record._event_reasons && record._event_reasons[family]) ||
    (record && record.schema === MARGIN_DEFENSE_SCHEMA ? "not_observed" : "margin_event_family_not_in_public_read_v1");
  return { family, classification: UNKNOWN, reason, as_of: record.as_of, provenance: record.provenance || null, official: false };
}

function eventsForRecord(record) {
  const incoming = Array.isArray(record.margin_events) ? record.margin_events : [];
  const byFamily = {};
  for (const event of incoming) {
    const row = classifyEvent(event, record);
    if (MARGIN_FAMILIES.indexOf(row.family) === -1) continue;
    byFamily[row.family] = row;
  }
  return MARGIN_FAMILIES.map((family) => byFamily[family] || emptyEvent(family, record));
}

function valueFacts(record) {
  const signed = official("valor_contratual", record.contract_value, record, {
    missing_reason: missingReason(record, "valor_contratual", "signed_contract_value_not_in_producer_projection"),
  });
  const estimated = official("valor_estimado", record.estimated_value, record, {
    qualifier: "estimated_not_signed",
    missing_reason: missingReason(record, "valor_estimado", "estimated_value_absent"),
  });
  return { signed, estimated };
}

function reviewPoints(diagnosis) {
  const points = [];
  if (diagnosis.valor_contratual.classification === UNKNOWN) {
    points.push("Conferir o valor global assinado no instrumento e nos extratos oficiais. O recorte público disponível não separa valor assinado de valor estimado.");
  }
  if (diagnosis.vigencia_inicio.classification === UNKNOWN || diagnosis.vigencia_fim.classification === UNKNOWN) {
    points.push("Conferir datas de início e fim de vigência no contrato e em termos aditivos. Sem essas datas o aniversário contratual permanece UNKNOWN.");
  }
  const unknownEvents = diagnosis.eventos_defesa_margem.filter((e) => e.classification === UNKNOWN);
  if (unknownEvents.length) {
    points.push("Conferir no PNCP e no diário oficial se existem aditivos, apostilamentos, reajustes, medições ou pagamentos. A ausência neste recorte não prova que o evento não ocorreu.");
  }
  if (diagnosis.incerteza === true) {
    points.push("O exportador marcou incerteza neste registro. Tratar cada campo UNKNOWN como pendência de prova, não como fato negativo.");
  }
  return points;
}

function nextSteps(diagnosis) {
  const steps = [
    "Abrir a fonte oficial listada e confirmar número, objeto e órgão.",
    "Separar o que é fato oficial do que permanece UNKNOWN antes de qualquer pedido.",
  ];
  if (diagnosis.eventos_defesa_margem.every((e) => e.classification === UNKNOWN)) {
    steps.push("Levantar extratos de aditivo, reajuste e medições no portal de origem. Este diagnóstico não inventa eventos.");
  }
  steps.push("Se a leitura oficial e o contrato interno divergirem, pedir uma segunda leitura técnica da CONFENGE sobre este contrato.");
  return steps;
}

function assertNoForbidden(text) {
  const blob = String(text || "").toLowerCase();
  for (const phrase of FORBIDDEN_CLAIMS) {
    if (blob.includes(phrase)) throw new Error(`forbidden_claim:${phrase}`);
  }
}

function diagnoseMargin(record, snapshot) {
  if (!record || typeof record !== "object") throw new Error("record required");
  const normalized = asConsumerRecord(record, snapshot);
  const values = valueFacts(normalized);
  const eventos = eventsForRecord(normalized);
  const officialEvents = eventos.filter((event) => event.classification === OFFICIAL);
  const derivedEvents = eventos.filter((event) => event.classification === DERIVED || event.classification === INFERRED);

  const diagnosis = {
    schema: normalized.schema || (snapshot && snapshot.schema) || null,
    public_id: official("public_id", normalized.public_id, normalized),
    process_key: official("process_key", normalized.process_key, normalized),
    official_number: official("official_number", normalized.official_number, normalized),
    titulo: official("titulo", normalized.title, normalized),
    orgao: official("orgao", normalized.organ && normalized.organ.display_name, normalized),
    fornecedor: official("fornecedor", normalized.supplier && normalized.supplier.display_name, normalized),
    uf: official("uf", normalized.uf, normalized, { missing_reason: missingReason(normalized, "uf", "producer_field_absent") }),
    municipio: official("municipio", normalized.municipio, normalized, { missing_reason: missingReason(normalized, "municipio", "producer_field_absent") }),
    valor_contratual: values.signed,
    valor_estimado: values.estimated,
    vigencia_inicio: official("vigencia_inicio", normalized.vigencia_start, normalized, {
      missing_reason: missingReason(normalized, "vigencia_inicio", "vigencia_not_in_producer_projection"),
    }),
    vigencia_fim: official("vigencia_fim", normalized.vigencia_end, normalized, {
      missing_reason: missingReason(normalized, "vigencia_fim", "vigencia_not_in_producer_projection"),
    }),
    aniversario_contratual: anniversaryFrom(normalized),
    vigencia: official("vigencia", normalized.term, normalized, {
      missing_reason: fieldReason(record, "term", "missing_term"),
    }),
    alteracoes_prazo_valor: officialEvents.filter((event) => event.family === "aditivo" || event.family === "prorrogacao" || event.family === "apostilamento"),
    eventos_defesa_margem: eventos,
    eventos_derivados: derivedEvents,
    fontes: official("fonte", normalized.source_uri || normalized.evidence_ref || normalized.source, normalized),
    as_of: official("as_of", normalized.as_of, normalized),
    freshness: normalized.as_of || null,
    completeness: normalized.completeness || UNKNOWN,
    reason_codes: normalized.reason_codes || [],
    incerteza: normalized.uncertainty === true,
    provenance: normalized.provenance || null,
    public_id_slug: normalized.public_id_slug || null,
    evidence_ref: normalized.evidence_ref || null,
  };

  diagnosis.unknown_fields = Object.keys(diagnosis)
    .filter((key) => diagnosis[key] && diagnosis[key].classification === UNKNOWN)
    .concat(eventos.filter((event) => event.classification === UNKNOWN).map((event) => `evento:${event.family}`));
  diagnosis.official_count = Object.keys(diagnosis).filter((key) => diagnosis[key] && diagnosis[key].classification === OFFICIAL).length;
  diagnosis.unknown_count = diagnosis.unknown_fields.length;
  diagnosis.o_que_merece_conferencia = reviewPoints(diagnosis);
  diagnosis.proximos_passos = nextSteps(diagnosis);
  diagnosis.resumo_executivo = [
    diagnosis.titulo.classification === OFFICIAL ? `Contrato/processo: ${diagnosis.titulo.value}` : "Título do contrato: UNKNOWN",
    diagnosis.orgao.classification === OFFICIAL ? `Órgão: ${diagnosis.orgao.value}` : "Órgão: UNKNOWN",
    diagnosis.valor_contratual.classification === OFFICIAL
      ? `Valor contratual (oficial): ${diagnosis.valor_contratual.value}`
      : diagnosis.valor_estimado.classification === OFFICIAL
        ? `Valor estimado na fonte pública: ${diagnosis.valor_estimado.value} (não é valor assinado)`
        : "Valor: UNKNOWN",
    diagnosis.vigencia_inicio.classification === OFFICIAL || diagnosis.vigencia_fim.classification === OFFICIAL
      ? `Vigência: ${diagnosis.vigencia_inicio.value || "UNKNOWN"} → ${diagnosis.vigencia_fim.value || "UNKNOWN"}`
      : "Vigência: UNKNOWN",
    `Freshness as_of: ${diagnosis.freshness || "UNKNOWN"}`,
    `${diagnosis.unknown_count} campo(s) ou família(s) de evento permanecem UNKNOWN.`,
  ];
  assertNoForbidden(JSON.stringify(diagnosis));
  return diagnosis;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function identityBlob(record) {
  if (isMarginDefenseRecord(record)) {
    const organ = knownValue(record, "organ") || {};
    const contractor = knownValue(record, "contractor") || {};
    return {
      ids: [record.canonical_contract_id, knownValue(record, "canonical_contract_id"), slugFromId(record.canonical_contract_id)],
      digits: [record.canonical_contract_id, organ.cnpj, contractor.cnpj],
      text: [knownValue(record, "object"), organ.name, contractor.name],
    };
  }
  return {
    ids: [record.public_id, record.process_key, record.official_number, record.public_id_slug],
    digits: [record.public_id, record.process_key, record.official_number, record.organ && record.organ.tax_identifier_export],
    text: [record.title, record.organ && record.organ.display_name, record.municipio, record.uf],
  };
}

function selectContract(snapshot, query) {
  const records = (snapshot && snapshot.records) || [];
  const raw = String(query || "").trim();
  if (!raw) return { ok: false, reason: "empty_query", record: null };
  const needle = fold(raw);
  const qDigits = digits(raw);
  for (const record of records) {
    const ids = identityBlob(record).ids;
    if (ids.some((id) => id && fold(id) === needle)) return { ok: true, reason: "exact_id", record };
  }
  if (qDigits.length >= 11) {
    const hits = records.filter((record) => identityBlob(record).digits.map(digits).join(" ").includes(qDigits));
    if (hits.length === 1) return { ok: true, reason: "identifier_digits", record: hits[0] };
    if (hits.length > 1) return { ok: false, reason: "ambiguous", record: null, matches: hits.length };
  }
  const textHits = records.filter((record) => {
    const blob = fold(identityBlob(record).text.filter(Boolean).join(" "));
    return needle.length >= 6 && blob.includes(needle);
  });
  if (textHits.length === 1) return { ok: true, reason: "text_match", record: textHits[0] };
  if (textHits.length > 1) return { ok: false, reason: "ambiguous", record: null, matches: textHits.length };
  return { ok: false, reason: "not_in_snapshot", record: null };
}

function evaluateIndexability(diagnosis, options) {
  const officialCount = diagnosis && typeof diagnosis.official_count === "number" ? diagnosis.official_count : 0;
  const unknown = diagnosis && typeof diagnosis.unknown_count === "number" ? diagnosis.unknown_count : 99;
  const denom = officialCount + unknown || 1;
  const dataConfidence = officialCount / denom;
  const hasProvenance = Boolean(diagnosis && diagnosis.provenance);
  const hasAsOf = Boolean(diagnosis && diagnosis.freshness);
  return {
    distinct_intent: true,
    own_information: hasProvenance,
    sample_size: (options && options.sample_size) || 1,
    semantic_differentiation: 0.7,
    independent_utility: officialCount >= 3 && hasProvenance,
    data_confidence: Number(dataConfidence.toFixed(3)),
    non_redundant: true,
    no_cannibalization: true,
    has_context_interpretation: true,
    identifiable_update: hasAsOf,
    useful_internal_links: true,
    contextual_cta: true,
    has_provenance: hasProvenance,
    legal_safe: true,
    content_value_score: Math.round(40 + officialCount * 4 - Math.min(unknown, 10)),
    min_sample: 1,
    min_score: 55,
  };
}

const PRODUCER_FIELD_CATALOG = [
  { field: "start_at", official_name: "vigencia início", consumer_field: "vigencia_inicio", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: true, reason: "missing_start_at" },
  { field: "end_at", official_name: "vigencia fim", consumer_field: "vigencia_fim", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: true, reason: "missing_end_at" },
  { field: "signed_at", official_name: "data de assinatura", consumer_field: "aniversario_contratual", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: true, reason: "missing_signed_at" },
  { field: "nominal_value", official_name: "valor contratual assinado", consumer_field: "valor_contratual", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: true, reason: "missing_nominal_value" },
  { field: "amendments", official_name: "aditivos", consumer_field: "evento:aditivo", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "no_amendment_signal" },
  { field: "scope_changes", official_name: "alteracao de escopo", consumer_field: "evento:apostilamento", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "no_amendment_signal" },
  { field: "term_changes", official_name: "eventos de prazo", consumer_field: "evento:prorrogacao", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "no_amendment_signal" },
  { field: "adjustment_anniversary", official_name: "reajuste", consumer_field: "evento:reajuste", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "no_explicit_adjustment_document" },
  { field: "adjustment_base", official_name: "reequilibrio", consumer_field: "evento:reequilibrio", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "no_explicit_adjustment_rule" },
  { field: "measurement_events", official_name: "medicoes", consumer_field: "evento:medicao", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "source_does_not_offer_measurements" },
  { field: "payment_events", official_name: "pagamentos", consumer_field: "evento:pagamento", producer_family: MARGIN_DEFENSE_SCHEMA, producer_version: "1.0", emitted_by_producer: true, emitted_by_public_read_v1: false, blocks_indexability: false, reason: "source_does_not_offer_payments" },
];

function _fieldState(diagnosis, spec) {
  if (spec.consumer_field.indexOf("evento:") === 0) {
    const family = spec.consumer_field.slice("evento:".length);
    const event = (diagnosis.eventos_defesa_margem || []).find((row) => row.family === family);
    return { classification: event ? event.classification : UNKNOWN, reason: event && event.reason ? event.reason : spec.reason };
  }
  const row = diagnosis[spec.consumer_field];
  return { classification: row && row.classification ? row.classification : UNKNOWN, reason: row && row.reason ? row.reason : spec.reason };
}

function diagnoseProducerBlock(snapshot, diagnosis, gateInputs) {
  const inputs = gateInputs || evaluateIndexability(diagnosis, { sample_size: 1 });
  const records = (snapshot && snapshot.records) || [];
  const missing = [];
  for (const spec of PRODUCER_FIELD_CATALOG) {
    const state = _fieldState(diagnosis, spec);
    if (state.classification === OFFICIAL || state.classification === DERIVED) continue;
    missing.push({
      field: spec.field,
      official_name: spec.official_name,
      consumer_field: spec.consumer_field,
      producer_family: spec.producer_family,
      producer_version: spec.producer_version,
      emitted_by_producer: spec.emitted_by_producer,
      emitted_by_public_read_v1: spec.emitted_by_public_read_v1,
      blocks_indexability: spec.blocks_indexability,
      classification: state.classification,
      reason: state.reason,
    });
  }
  const blocking = missing.filter((row) => row.blocks_indexability);
  const reserved = missing.filter((row) => !row.blocks_indexability);
  const dataConfidence = Number(inputs.data_confidence);
  const indexableByConfidence = dataConfidence >= 0.45;
  return {
    asset: "https://confenge.com.br/ferramentas/diagnostico-defesa-margem/",
    gate_fail: indexableByConfidence ? null : "low_data_confidence",
    indexable_by_data_confidence: indexableByConfidence,
    data_confidence: dataConfidence,
    producer: (snapshot && snapshot.producer) || "extra-cli",
    producer_contracts: (snapshot && snapshot.producer_contracts) || [MARGIN_DEFENSE_SCHEMA],
    consumer_contract: (snapshot && snapshot.schema) || (snapshot && snapshot.contract_version) || MARGIN_DEFENSE_SCHEMA,
    snapshot_id: snapshot && (snapshot.content_hash || snapshot.snapshot_id),
    snapshot_as_of: snapshot && snapshot.as_of,
    record_count: records.length,
    completeness: diagnosis && diagnosis.completeness,
    official_count: diagnosis && diagnosis.official_count,
    unknown_count: diagnosis && diagnosis.unknown_count,
    blocking_official_fields: blocking,
    reserved_margin_event_fields: reserved,
    do_not_relax_gate: true,
    consumer_ready: true,
    next_action:
      blocking.length === 0
        ? "Producer facts already satisfy the data-confidence floor. Re-run indexability.py; do not invent remaining event families."
        : "extra-cli must emit the blocking official fields on public-read-margin-defense/1.0. Do not lower the 0.45 floor.",
  };
}

module.exports = {
  OFFICIAL,
  DERIVED,
  INFERRED,
  UNKNOWN,
  MARGIN_DEFENSE_SCHEMA,
  MARGIN_FAMILIES,
  PRODUCER_FIELD_CATALOG,
  FORBIDDEN_CONCLUSION_FIELDS,
  diagnoseMargin,
  selectContract,
  evaluateIndexability,
  diagnoseProducerBlock,
  normalizeMarginDefenseRecord,
  isMarginDefenseRecord,
  anniversaryFrom,
  eventsForRecord,
  hasOfficialBacking,
};

  root.ConfengeDiagnoseMargin = module.exports;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
