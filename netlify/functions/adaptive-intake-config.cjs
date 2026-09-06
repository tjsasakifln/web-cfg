const {
  loadPin,
  enabledNuclei,
  NUCLEI,
  NEEDS,
  INTAKE_CONTEXTS,
  pinHash,
} = require("./lib/adaptive-intake.cjs");

const PUBLIC_OPTIONS = Object.freeze([
  { value: "pericia_ou_disputa_tecnica", label: "Perícia, laudo ou apoio em disputa técnica" },
  { value: "avaliacao_de_imovel", label: "Avaliação de imóvel" },
  { value: "obra_edificacao_ou_documentacao", label: "Obra, edificação ou documentação técnica" },
  { value: "seguranca_do_trabalho", label: "Segurança do trabalho" },
  { value: "licitacao_obra_ou_contrato_publico", label: "Licitação, obra ou contrato público" },
  { value: "outra_demanda_tecnica", label: "Outra demanda técnica" },
]);

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "method_not_allowed" }, { Allow: "GET" });
  }

  const authority = loadPin();
  const enabled = enabledNuclei();
  if (!authority.ok || !enabled.size) {
    return response(503, { ok: false, error: "intake_unavailable" });
  }

  const intakeContext = String(event.queryStringParameters?.intake_context || "");
  const contextRule = intakeContext ? INTAKE_CONTEXTS[intakeContext] : null;
  if (intakeContext && !contextRule) {
    return response(422, { ok: false, error: "intake_context_unknown" });
  }

  const options = PUBLIC_OPTIONS.filter((option) => {
    const nucleusId = NEEDS[option.value];
    return enabled.has(nucleusId) && Object.hasOwn(NUCLEI, nucleusId);
  }).map((option) => ({
    ...option,
    location_required: contextRule?.need_code === option.value
      ? contextRule.location_material
      : NUCLEI[NEEDS[option.value]].location_material === true,
  }));

  if (!options.length) {
    return response(503, { ok: false, error: "intake_unavailable" });
  }

  return response(200, {
    ok: true,
    intake_version: authority.pin.intake_version,
    intake_pin_hash: pinHash(authority.pin),
    options,
  });
};
