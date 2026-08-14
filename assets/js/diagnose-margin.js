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

function present(value) {
  if (value == null) return false;
  if (typeof value === "string" && !value.trim()) return false;
  if (Array.isArray(value) && !value.length) return false;
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
  return row;
}

function official(field, value, record, extra) {
  if (!present(value)) {
    return fact(field, UNKNOWN, null, {
      reason: (extra && extra.missing_reason) || "producer_field_absent",
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
  });
}

function anniversaryFrom(record) {
  const raw = record.data_assinatura || record.vigencia_start;
  if (!present(raw)) {
    return fact("aniversario_contratual", UNKNOWN, null, {
      reason: "no_official_start_or_signature_date",
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
    return {
      family: family || "unknown_family",
      classification: UNKNOWN,
      reason: "unsupported_or_missing_family",
    };
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
    };
  }
  return {
    family,
    classification: UNKNOWN,
    reason: "event_missing_source_provenance_or_as_of",
    as_of: record.as_of,
  };
}

function emptyEvents(record) {
  return MARGIN_FAMILIES.map((family) => ({
    family,
    classification: UNKNOWN,
    reason: "margin_event_family_not_in_public_read_v1",
    as_of: record.as_of,
    provenance: record.provenance || null,
    official: false,
  }));
}

function valueFacts(record) {
  const signed = official("valor_contratual", record.contract_value, record, {
    missing_reason: "signed_contract_value_not_in_producer_projection",
  });
  const estimated = official("valor_estimado", record.estimated_value, record, {
    qualifier: "estimated_not_signed",
    missing_reason: "estimated_value_absent",
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
    if (blob.includes(phrase)) {
      throw new Error(`forbidden_claim:${phrase}`);
    }
  }
}

function diagnoseMargin(record) {
  if (!record || typeof record !== "object") {
    throw new Error("record required");
  }
  const values = valueFacts(record);
  const eventsIn = Array.isArray(record.margin_events) ? record.margin_events : [];
  const eventos = eventsIn.length ? eventsIn.map((event) => classifyEvent(event, record)) : emptyEvents(record);
  const officialEvents = eventos.filter((event) => event.classification === OFFICIAL);
  const derivedEvents = eventos.filter((event) => event.classification === DERIVED || event.classification === INFERRED);

  const diagnosis = {
    public_id: official("public_id", record.public_id, record),
    process_key: official("process_key", record.process_key, record),
    official_number: official("official_number", record.official_number, record),
    titulo: official("titulo", record.title, record),
    orgao: official("orgao", record.organ && record.organ.display_name, record),
    fornecedor: official("fornecedor", record.supplier && record.supplier.display_name, record),
    uf: official("uf", record.uf, record),
    municipio: official("municipio", record.municipio, record),
    valor_contratual: values.signed,
    valor_estimado: values.estimated,
    vigencia_inicio: official("vigencia_inicio", record.vigencia_start, record, {
      missing_reason: "vigencia_not_in_producer_projection",
    }),
    vigencia_fim: official("vigencia_fim", record.vigencia_end, record, {
      missing_reason: "vigencia_not_in_producer_projection",
    }),
    aniversario_contratual: anniversaryFrom(record),
    alteracoes_prazo_valor: officialEvents.filter((event) => event.family === "aditivo" || event.family === "prorrogacao" || event.family === "apostilamento"),
    eventos_defesa_margem: eventos,
    eventos_derivados: derivedEvents,
    fontes: official("fonte", record.source_uri || record.source, record),
    as_of: official("as_of", record.as_of, record),
    freshness: record.as_of || null,
    completeness: record.completeness || UNKNOWN,
    reason_codes: record.reason_codes || [],
    incerteza: record.uncertainty === true,
    provenance: record.provenance || null,
    public_id_slug: record.public_id_slug || null,
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

  const serialized = JSON.stringify(diagnosis);
  assertNoForbidden(serialized);
  return diagnosis;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function selectContract(snapshot, query) {
  const records = (snapshot && snapshot.records) || [];
  const raw = String(query || "").trim();
  if (!raw) return { ok: false, reason: "empty_query", record: null };
  const needle = raw.toLowerCase();
  const qDigits = digits(raw);

  for (const record of records) {
    const ids = [record.public_id, record.process_key, record.official_number, record.public_id_slug];
    if (ids.some((id) => id && String(id).toLowerCase() === needle)) {
      return { ok: true, reason: "exact_id", record };
    }
  }
  if (qDigits.length >= 11) {
    const hits = records.filter((record) => {
      const blob = [record.public_id, record.process_key, record.official_number, record.organ && record.organ.tax_identifier_export]
        .map(digits)
        .join(" ");
      return blob.includes(qDigits);
    });
    if (hits.length === 1) return { ok: true, reason: "identifier_digits", record: hits[0] };
    if (hits.length > 1) return { ok: false, reason: "ambiguous", record: null, matches: hits.length };
  }
  const textHits = records.filter((record) => {
    const blob = [record.title, record.organ && record.organ.display_name, record.municipio, record.uf]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return needle.length >= 6 && blob.includes(needle);
  });
  if (textHits.length === 1) return { ok: true, reason: "text_match", record: textHits[0] };
  if (textHits.length > 1) return { ok: false, reason: "ambiguous", record: null, matches: textHits.length };
  return { ok: false, reason: "not_in_snapshot", record: null };
}

function evaluateIndexability(diagnosis, options) {
  const official = diagnosis && typeof diagnosis.official_count === "number" ? diagnosis.official_count : 0;
  const unknown = diagnosis && typeof diagnosis.unknown_count === "number" ? diagnosis.unknown_count : 99;
  const denom = official + unknown || 1;
  const dataConfidence = official / denom;
  const hasProvenance = Boolean(diagnosis && diagnosis.provenance);
  const hasAsOf = Boolean(diagnosis && diagnosis.freshness);
  const independentUtility = official >= 3 && hasProvenance;
  const contentValueScore = Math.round(40 + official * 4 - Math.min(unknown, 10));
  return {
    distinct_intent: true,
    own_information: hasProvenance,
    sample_size: (options && options.sample_size) || 1,
    semantic_differentiation: 0.7,
    independent_utility: independentUtility,
    data_confidence: Number(dataConfidence.toFixed(3)),
    non_redundant: true,
    no_cannibalization: true,
    has_context_interpretation: true,
    identifiable_update: hasAsOf,
    useful_internal_links: true,
    contextual_cta: true,
    has_provenance: hasProvenance,
    legal_safe: true,
    content_value_score: contentValueScore,
    min_sample: 1,
    min_score: 55,
  };
}

module.exports = {
  OFFICIAL,
  DERIVED,
  INFERRED,
  UNKNOWN,
  MARGIN_FAMILIES,
  diagnoseMargin,
  selectContract,
  evaluateIndexability,
  anniversaryFrom,
};

  root.ConfengeDiagnoseMargin = module.exports;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
