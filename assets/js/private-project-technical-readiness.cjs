/**
 * Diagnóstico de Prontidão Técnica de Obra Privada.
 * Pure transform over a closed answer vocabulary. No DOM, no network, no PII.
 * Twin: private-project-technical-readiness.cjs
 */
(function (root) {
  "use strict";

  var ENGINE_ID = "private_project_technical_readiness_v1";
  var ENGINE_VERSION = "1.1.0";
  var ASSET_ID = "private_project_technical_readiness_v1";
  var NUCLEUS = "building_engineering_documentation";
  var OFFER_CANDIDATE = "private_project_technical_readiness_assessment";
  var SOURCE = "CONFENGE_WEB";
  var OUTBOUND_ELIGIBLE = false;
  var AUTO_SEND = false;

  var EVIDENCE_PRESENT = "EVIDENCE_PRESENT";
  var GAP = "GAP";
  var UNKNOWN = "UNKNOWN";
  var FACT_USER_SUPPLIED = "FACT_USER_SUPPLIED";
  var CALCULATION = "CALCULATION";
  var INFERENCE = "INFERENCE";

  var PRIORITY_BLOCKING = "PRIORITY_BLOCKING";
  var PRIORITY_ATTENTION = "PRIORITY_ATTENTION";
  var PRIORITY_UNKNOWN = "PRIORITY_UNKNOWN";
  var PRIORITY_NONE = "PRIORITY_NONE";

  var FORBIDDEN_INPUT_KEYS = Object.freeze([
    "nome", "name", "email", "phone", "telefone", "tel", "whatsapp",
    "documento", "cpf", "cnpj", "endereco", "address", "upload", "file",
    "mensagem", "message", "valor", "free_text", "freetext", "observacao",
    "observação", "identificador", "contrato",
  ]);

  var FORBIDDEN_CLAIMS = Object.freeze([
    "apto",
    "conforme",
    "aprovado",
    "pronto para executar",
    "certificação",
    "certificacao",
    "compliance",
    "laudo",
    "auditoria concluída",
    "auditoria concluida",
    "parecer jurídico",
    "parecer juridico",
    "inteligência artificial",
    "inteligencia artificial",
    "benchmark",
    "ranking",
    "score percentual",
    "% de prontidão",
    "% de prontidao",
    "obra segura",
    "obra ilegal",
    "cálculo validado",
    "calculo validado",
    "conformidade normativa",
    "conformidade total",
    "art válida",
    "art valida",
    "projeto errado",
    "aprovação garantida",
    "aprovacao garantida",
  ]);

  var DOMAIN_IDS = Object.freeze([
    "decision_scope_stage",
    "design_set_revisions_responsibility",
    "quantities_budget_bases_memory",
    "coordination_constructability_bim",
    "changes_execution_measurement",
    "asbuilt_handover_operations",
    "technical_responsibility_art_inspections",
  ]);

  var VOCAB = Object.freeze({
    work_stage: Object.freeze(["planejamento", "projeto", "contratacao", "execucao", "entrega", "operacao", "retomada", UNKNOWN]),
    decision_on_table: Object.freeze(["contratar_projeto", "contratar_execucao", "iniciar_execucao", "retomar_obra", "aprovar_medicao", "aceitar_entrega", "operar_manter", UNKNOWN]),
    scope_record: Object.freeze(["escrito_assinado", "escrito_sem_assinatura", "so_verbal", UNKNOWN]),
    design_set: Object.freeze(["completo_revisao_atual", "parcial", "nenhum", UNKNOWN]),
    revision_control: Object.freeze(["numerada_com_datas", "arquivos_sem_controle", UNKNOWN]),
    design_responsibility: Object.freeze(["nomeada_por_disciplina", "nomeada_parcial", "nao_nomeada", UNKNOWN]),
    quantities: Object.freeze(["takeoff_ligado_projetos", "planilha_sem_rastreio", "nenhum", UNKNOWN]),
    budget: Object.freeze(["composicoes_e_bases", "preco_global_so", "nenhum", UNKNOWN]),
    calc_memory: Object.freeze(["presente_ligada", "presente_desligada", "nenhum", UNKNOWN]),
    coordination: Object.freeze(["issue_register_rastreado", "reunioes_sem_registro", "nenhum", UNKNOWN]),
    bim_or_constructability: Object.freeze(["modelo_federado_atual", "revisao_construtibilidade_registrada", "modelos_isolados", "nenhum", UNKNOWN]),
    change_control: Object.freeze(["registro_escrito_com_impacto", "informal", "nenhum", UNKNOWN]),
    execution_records: Object.freeze(["diario_e_base_medicao", "parcial", "nenhum", UNKNOWN]),
    measurement_trace: Object.freeze(["ligada_orcamento_e_executado", "planilha_isolada", "nenhum", UNKNOWN]),
    asbuilt: Object.freeze(["atual", "desatualizado", "nenhum", UNKNOWN]),
    handover_docs: Object.freeze(["manuais_garantias_ensaios", "parcial", "nenhum", UNKNOWN]),
    art_declared: Object.freeze(["emitida_declarada", "nao_emitida_declarada", "nao_aplicavel_declarada", UNKNOWN]),
    inspections_declared: Object.freeze(["registradas", "nao_registradas", UNKNOWN]),
  });

  var QUESTION_IDS = Object.freeze(Object.keys(VOCAB));

  var QUESTION_DOMAIN = Object.freeze({
    work_stage: "decision_scope_stage",
    decision_on_table: "decision_scope_stage",
    scope_record: "decision_scope_stage",
    design_set: "design_set_revisions_responsibility",
    revision_control: "design_set_revisions_responsibility",
    design_responsibility: "design_set_revisions_responsibility",
    quantities: "quantities_budget_bases_memory",
    budget: "quantities_budget_bases_memory",
    calc_memory: "quantities_budget_bases_memory",
    coordination: "coordination_constructability_bim",
    bim_or_constructability: "coordination_constructability_bim",
    change_control: "changes_execution_measurement",
    execution_records: "changes_execution_measurement",
    measurement_trace: "changes_execution_measurement",
    asbuilt: "asbuilt_handover_operations",
    handover_docs: "asbuilt_handover_operations",
    art_declared: "technical_responsibility_art_inspections",
    inspections_declared: "technical_responsibility_art_inspections",
  });

  var BLOCKING_BY_DECISION = Object.freeze({
    contratar_projeto: Object.freeze(["decision_scope_stage", "design_set_revisions_responsibility"]),
    contratar_execucao: Object.freeze(["decision_scope_stage", "design_set_revisions_responsibility", "quantities_budget_bases_memory", "coordination_constructability_bim"]),
    iniciar_execucao: Object.freeze(["decision_scope_stage", "design_set_revisions_responsibility", "quantities_budget_bases_memory", "coordination_constructability_bim", "technical_responsibility_art_inspections"]),
    retomar_obra: Object.freeze(["decision_scope_stage", "design_set_revisions_responsibility", "changes_execution_measurement", "asbuilt_handover_operations"]),
    aprovar_medicao: Object.freeze(["quantities_budget_bases_memory", "changes_execution_measurement"]),
    aceitar_entrega: Object.freeze(["changes_execution_measurement", "asbuilt_handover_operations"]),
    operar_manter: Object.freeze(["asbuilt_handover_operations"]),
    UNKNOWN: Object.freeze([]),
  });

  var ARTIFACT_BY_DOMAIN = Object.freeze({
    decision_scope_stage: "Matriz de decisão, escopo e estágio da obra",
    design_set_revisions_responsibility: "Levantamento do conjunto de projetos, revisões e responsabilidades",
    quantities_budget_bases_memory: "Reconciliação de quantitativos, orçamento, bases e memória de cálculo",
    coordination_constructability_bim: "Registro de compatibilização e constructability com issue register",
    changes_execution_measurement: "Caderno de mudanças, medições e rastreabilidade de execução",
    asbuilt_handover_operations: "Pacote as-built, entrega e documentação operacional",
    technical_responsibility_art_inspections: "Conferência documental das condições declaradas de ART e inspeções (sem parecer de direito)",
  });

  var DOMAIN_META = Object.freeze({
    decision_scope_stage: Object.freeze({
      label: "Decisão, escopo e estágio",
      present_evidence: "Estágio e decisão declarados, com escopo escrito e assinado.",
      missing: "Escopo escrito e assinado, estágio da obra e decisão que está na mesa.",
      consequence: "Contratar ou executar sem recorte de escopo deixa o objeto e o critério de aceite ambíguos.",
      next: "Localizar o instrumento de escopo assinado e registrar o estágio e a decisão atuais em uma folha única.",
    }),
    design_set_revisions_responsibility: Object.freeze({
      label: "Projetos, revisões e responsabilidade",
      present_evidence: "Conjunto completo na revisão atual, com controle de revisão e responsabilidade nomeada por disciplina.",
      missing: "Conjunto de projetos na revisão atual, lista de revisões com data e responsável por disciplina.",
      consequence: "Orçar, contratar ou executar sobre desenho incompleto ou sem dono por disciplina aumenta retrabalho e conflito de interferência.",
      next: "Montar a lista do conjunto (disciplina, revisão, data, responsável) e marcar o que falta.",
    }),
    quantities_budget_bases_memory: Object.freeze({
      label: "Quantitativos, orçamento, bases e memória",
      present_evidence: "Quantitativo ligado aos projetos, orçamento com composições e bases, memória de cálculo ligada.",
      missing: "Levantamento ligado aos desenhos, composições/bases do orçamento e memória de cálculo rastreável.",
      consequence: "Medir, aditar ou comparar preço sem essa cadeia deixa a diferença de quantidade e de critério sem âncora.",
      next: "Conferir se cada linha de quantitativo aponta para um desenho/revisão e se a composição aponta para uma base nomeada.",
    }),
    coordination_constructability_bim: Object.freeze({
      label: "Compatibilização, construtibilidade e BIM",
      present_evidence: "Issue register rastreado e evidência de construtibilidade (modelo federado atual ou revisão registrada).",
      missing: "Issue register com status e evidência de construtibilidade (modelo federado atual ou revisão registrada). Ausência de BIM isolada não preenche essa evidência.",
      consequence: "Iniciar execução sem interferências registradas deixa choques de disciplina para o canteiro.",
      next: "Abrir o issue register (ou criá-lo) e registrar se a construtibilidade foi revista no modelo ou em ata.",
    }),
    changes_execution_measurement: Object.freeze({
      label: "Mudanças, execução, medição e rastreabilidade",
      present_evidence: "Mudanças com impacto escrito, diário/base de medição e medição ligada ao orçamento e ao executado.",
      missing: "Registro escrito de mudanças com impacto, diário de obra ou equivalente, e medição ligada ao orçamento e ao executado.",
      consequence: "Aprovar medição ou retomar frente sem essa cadeia deixa quantidade e nexo de mudança sem suporte.",
      next: "Cruzar a última medição com o orçamento e com o registro de mudanças do mesmo período.",
    }),
    asbuilt_handover_operations: Object.freeze({
      label: "As-built, entrega, operação e documentação final",
      present_evidence: "As-built atual e pacote de entrega (manuais, garantias, ensaios).",
      missing: "As-built na revisão atual e pacote de entrega (manuais, garantias, ensaios).",
      consequence: "Aceitar entrega ou operar sem as-built e pacote final deixa manutenção e pendências sem mapa.",
      next: "Conferir a data do as-built contra a última revisão de execução e listar o que falta no pacote de entrega.",
    }),
    technical_responsibility_art_inspections: Object.freeze({
      label: "Condições declaradas de ART e inspeções",
      present_evidence: "O usuário declarou uma condição de ART e de inspeções. Isso não verifica registro, atribuição nem validade.",
      missing: "Documento de ART do recorte declarado e registros de inspeção. A declaração de ausência nesta autoavaliação não substitui esses documentos.",
      consequence: "A decisão de executar ou entregar continua dependente de conferência documental externa; esta leitura não emite conclusão de direito.",
      next: "Conferir os documentos de ART e os registros de inspeção fora desta autoavaliação, com o responsável técnico do caso.",
    }),
  });

  var ROUTE_ORCAMENTO = "orcamento";
  var ROUTE_COMPAT = "compatibilizacao";
  var ROUTE_REVISAO = "revisao";
  var ROUTE_ESCOPO = "escopo";
  var HUMAN_CONTACT_PATH = "/triagem-tecnica/";
  var HUMAN_CONTACT_HASH = "obra-imovel";
  var NEED_CODE = "obra_edificacao_ou_documentacao";
  var ROUTE_FAMILY = "prontidao-tecnica-obra-privada";
  var DESTINATION_MAP_SCHEMA = "confenge.canonical-destination-map/1.0";

  var ROUTING_TABLE = Object.freeze([
    Object.freeze({
      id: ROUTE_ORCAMENTO,
      domain_id: "quantities_budget_bases_memory",
      offer_id: "quantity_takeoff_budgeting",
      intent_family: "orcar_planejar_decidir",
      public_name: "Levantamento quantitativo e orçamentação",
      why: "Faltam quantitativos ligados aos projetos ou base de custo com composições. Sem essa cadeia, comparar preço, medição ou aditivo fica sem âncora.",
      next: "Pedir levantamento quantitativo e orçamentação do recorte, ou esclarecer o projeto de origem se ele ainda não puder ser lido.",
    }),
    Object.freeze({
      id: ROUTE_COMPAT,
      domain_id: "coordination_constructability_bim",
      offer_id: "bim_coordination_clash_register",
      intent_family: "projetar_revisar_compatibilizar",
      public_name: "Compatibilização e registro de interferências",
      why: "As interfaces entre disciplinas não estão conferidas com registro. Contratar ou iniciar execução assim deixa interferências para o canteiro.",
      next: "Pedir compatibilização com registro de interferências antes de executar ou fechar o preço da obra.",
    }),
    Object.freeze({
      id: ROUTE_REVISAO,
      domain_id: "design_set_revisions_responsibility",
      offer_id: "complementary_engineering_project_review",
      intent_family: "projetar_revisar_compatibilizar",
      public_name: "Revisão de projeto recebido",
      why: "O conjunto de projetos recebido está incompleto, sem controle de revisão ou sem responsável por disciplina. Convém revisar o que chegou antes de orçar ou executar.",
      next: "Pedir revisão do projeto recebido para localizar inconsistências e o que falta documentar.",
    }),
  ]);

  function routingRowById(id) {
    for (var i = 0; i < ROUTING_TABLE.length; i += 1) {
      if (ROUTING_TABLE[i].id === id) return ROUTING_TABLE[i];
    }
    return null;
  }

  function cloneRoute(row, extra) {
    var out = {
      id: row.id,
      domain_id: row.domain_id,
      offer_id: row.offer_id,
      intent_family: row.intent_family,
      public_name: row.public_name,
      why: row.why,
      next: row.next,
    };
    var extraKeys = extra ? Object.keys(extra) : [];
    for (var i = 0; i < extraKeys.length; i += 1) out[extraKeys[i]] = extra[extraKeys[i]];
    return out;
  }

  function primaryOrderForDecision(decision) {
    if (decision === "iniciar_execucao" || decision === "contratar_execucao") {
      return [ROUTE_COMPAT, ROUTE_ORCAMENTO, ROUTE_REVISAO];
    }
    if (decision === "contratar_projeto") {
      return [ROUTE_REVISAO, ROUTE_COMPAT, ROUTE_ORCAMENTO];
    }
    return [ROUTE_ORCAMENTO, ROUTE_REVISAO, ROUTE_COMPAT];
  }

  function justifyPrimary(primaryId, triggeredIds, decision) {
    var hasCost = triggeredIds.indexOf(ROUTE_ORCAMENTO) !== -1;
    var hasInterfaces = triggeredIds.indexOf(ROUTE_COMPAT) !== -1;
    var row = routingRowById(primaryId);
    if (hasCost && hasInterfaces) {
      if (primaryId === ROUTE_COMPAT) {
        return "A recomendação principal é compatibilização porque a decisão declarada envolve contratar ou iniciar execução, e interfaces não conferidas alteram quantidades. O orçamento permanece como caminho possível; não é necessário contratar os dois de uma vez.";
      }
      if (primaryId === ROUTE_ORCAMENTO) {
        return "A recomendação principal é levantamento quantitativo e orçamentação porque a lacuna de quantidades e base de custo é a que mais trava a decisão de preço neste recorte. A conferência de interfaces permanece como caminho possível; não é necessário contratar os dois de uma vez.";
      }
      if (primaryId === ROUTE_REVISAO) {
        return "A recomendação principal é revisão de projeto recebido porque a decisão declarada é contratar projeto, e o conjunto recebido está incompleto. Orçamento e compatibilização permanecem como caminhos possíveis; não é necessário contratar os dois de uma vez.";
      }
    }
    if (!row) return "Nenhuma contratação é sugerida a partir destas respostas.";
    if (decision && decision !== UNKNOWN) {
      return row.why + " A prioridade segue a decisão declarada, sem exigir outro serviço no mesmo passo.";
    }
    return row.why + " A prioridade segue a lacuna declarada, sem exigir outro serviço no mesmo passo.";
  }

  function domainByIdFromList(domains, id) {
    for (var i = 0; i < domains.length; i += 1) {
      if (domains[i].id === id) return domains[i];
    }
    return null;
  }

  function routePrivateProjectReadiness(result) {
    var domains = result && result.domains ? result.domains : [];
    var answers = result && result.answers ? result.answers : emptyAnswers();
    var triggered = [];
    var i;
    for (i = 0; i < ROUTING_TABLE.length; i += 1) {
      var spec = ROUTING_TABLE[i];
      var domain = domainByIdFromList(domains, spec.domain_id);
      if (domain && domain.status === GAP) triggered.push(cloneRoute(spec, { priority: domain.priority }));
    }
    var triggeredIds = [];
    for (i = 0; i < triggered.length; i += 1) triggeredIds.push(triggered[i].id);

    var unknownCommercial = 0;
    for (i = 0; i < ROUTING_TABLE.length; i += 1) {
      var commercial = domainByIdFromList(domains, ROUTING_TABLE[i].domain_id);
      if (commercial && commercial.status === UNKNOWN) unknownCommercial += 1;
    }

    var primary = null;
    var alternatives = [];
    if (triggered.length === 1) {
      primary = triggered[0];
    } else if (triggered.length > 1) {
      var order = primaryOrderForDecision(answers.decision_on_table);
      var chosenId = null;
      for (i = 0; i < order.length; i += 1) {
        if (triggeredIds.indexOf(order[i]) !== -1) {
          chosenId = order[i];
          break;
        }
      }
      for (i = 0; i < triggered.length; i += 1) {
        if (triggered[i].id === chosenId) primary = triggered[i];
        else alternatives.push(triggered[i]);
      }
    }

    var scopeConversation = false;
    var summaryNext = "";
    if (primary) {
      summaryNext = primary.next;
    } else if (unknownCommercial > 0) {
      scopeConversation = true;
      summaryNext = "Ainda não há elementos suficientes para indicar um serviço. Uma conversa de escopo esclarece o recorte. Esta leitura não é um diagnóstico conclusivo.";
    } else {
      summaryNext = "As respostas não apontam lacuna nos caminhos de orçamento, revisão ou compatibilização. Nenhuma contratação é sugerida. O resultado completo continua disponível, sem contato.";
    }

    var justification = primary
      ? justifyPrimary(primary.id, triggeredIds, answers.decision_on_table)
      : summaryNext;

    return {
      table_id: "private_project_readiness_routing_v1",
      unknown_never_scores: true,
      force_two_contracts: false,
      primary: primary,
      alternatives: alternatives,
      triggered_ids: triggeredIds,
      justification: justification,
      scope_conversation: scopeConversation,
      human_alternative: {
        required: false,
        path: HUMAN_CONTACT_PATH,
        hash: HUMAN_CONTACT_HASH,
        need_code: NEED_CODE,
        label: "Conversar sobre o recorte, sem compromisso",
      },
      summary_next: summaryNext,
    };
  }

  function normalizeDestinationMap(raw) {
    var empty = { schema: DESTINATION_MAP_SCHEMA, by_offer_id: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
    var source = raw.by_offer_id && typeof raw.by_offer_id === "object" ? raw.by_offer_id : raw;
    var byOffer = {};
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var value = source[key];
      var path = null;
      var intentFamily = null;
      if (typeof value === "string") path = value;
      else if (value && typeof value === "object") {
        path = value.path || value.href || null;
        intentFamily = value.intent_family || null;
      }
      if (typeof path === "string" && path.charAt(0) === "/" && path.indexOf("://") === -1) {
        byOffer[key] = { path: path, intent_family: intentFamily };
      }
    }
    return { schema: DESTINATION_MAP_SCHEMA, by_offer_id: byOffer };
  }

  function resolveCommercialDestination(offerId, canonicalMap) {
    var id = String(offerId || "");
    var map = normalizeDestinationMap(canonicalMap);
    var entry = map.by_offer_id[id];
    if (!id || !entry || !entry.path) {
      return { offer_id: id || null, href: null, present: false, intent_family: null };
    }
    return {
      offer_id: id,
      href: entry.path,
      present: true,
      intent_family: entry.intent_family || null,
    };
  }

  function buildContactContext(result) {
    var routing = result && result.routing ? result.routing : {};
    var primary = routing.primary || null;
    return {
      source_origin_asset_id: ASSET_ID,
      source_origin_route_family: ROUTE_FAMILY,
      need_code: NEED_CODE,
      offer_candidate_id: primary && primary.offer_id ? primary.offer_id : "",
      intent_family: primary && primary.intent_family ? primary.intent_family : "",
      route_id: primary && primary.id ? primary.id : ROUTE_ESCOPO,
    };
  }

  function buildContactHref(context) {
    var ctx = context && typeof context === "object" ? context : {};
    var params = [];
    var allowed = ["need_code", "offer_candidate_id", "intent_family", "route_id", "source_origin_asset_id", "source_origin_route_family"];
    for (var i = 0; i < allowed.length; i += 1) {
      var key = allowed[i];
      var value = ctx[key];
      if (value) params.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
    }
    var query = params.length ? "?" + params.join("&") : "";
    return HUMAN_CONTACT_PATH + query + "#" + HUMAN_CONTACT_HASH;
  }

  function summarizeReadiness(result) {
    var domains = result && result.domains ? result.domains : [];
    var present = [];
    var gaps = [];
    var unknowns = [];
    for (var i = 0; i < domains.length; i += 1) {
      var row = {
        id: domains[i].id,
        label: domains[i].label,
        why: domains[i].decision_consequence,
        next: domains[i].next_verification,
      };
      if (domains[i].status === EVIDENCE_PRESENT) present.push(row);
      else if (domains[i].status === GAP) gaps.push(row);
      else unknowns.push(row);
    }
    return { present: present, gaps: gaps, unknowns: unknowns };
  }

  function fnv1aHex(text) {
    var h = 2166136261;
    var s = String(text || "");
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i += 1) {
      parts.push(JSON.stringify(keys[i]) + ":" + stableStringify(value[keys[i]]));
    }
    return "{" + parts.join(",") + "}";
  }

  function lower(text) {
    return String(text || "").toLowerCase();
  }

  function collectForbiddenClaims(text) {
    var hay = lower(text);
    var hits = [];
    for (var i = 0; i < FORBIDDEN_CLAIMS.length; i += 1) {
      if (hay.indexOf(FORBIDDEN_CLAIMS[i]) !== -1) hits.push(FORBIDDEN_CLAIMS[i]);
    }
    if (/(^|[^a-záàâãéêíóôõúüç])ia([^a-záàâãéêíóôõúüç]|$)/i.test(String(text || ""))) {
      hits.push("IA");
    }
    return hits;
  }

  function assertSafeWording(text, where) {
    var hits = collectForbiddenClaims(text);
    if (hits.length) {
      throw new Error("forbidden_claim:" + where + ":" + hits.join(","));
    }
  }

  function emptyAnswers() {
    var out = {};
    for (var i = 0; i < QUESTION_IDS.length; i += 1) out[QUESTION_IDS[i]] = UNKNOWN;
    return out;
  }

  function normalizeAnswers(raw) {
    var input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    var keys = Object.keys(input);
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var lowered = lower(key);
      if (FORBIDDEN_INPUT_KEYS.indexOf(key) !== -1 || FORBIDDEN_INPUT_KEYS.indexOf(lowered) !== -1) {
        throw new Error("forbidden_input:" + key);
      }
      if (!Object.prototype.hasOwnProperty.call(VOCAB, key)) {
        throw new Error("unknown_input_key:" + key);
      }
    }
    var answers = emptyAnswers();
    for (i = 0; i < QUESTION_IDS.length; i += 1) {
      var id = QUESTION_IDS[i];
      if (!Object.prototype.hasOwnProperty.call(input, id) || input[id] == null || input[id] === "") {
        answers[id] = UNKNOWN;
        continue;
      }
      var value = String(input[id]);
      if (VOCAB[id].indexOf(value) === -1) throw new Error("invalid_value:" + id);
      answers[id] = value;
    }
    return answers;
  }

  function factStatus(value, presentValues, gapValues) {
    if (value === UNKNOWN) return "unknown";
    if (presentValues.indexOf(value) !== -1) return "present";
    if (gapValues.indexOf(value) !== -1) return "gap";
    return "unknown";
  }

  function rollup(flags) {
    var hasGap = false;
    var hasUnknown = false;
    for (var i = 0; i < flags.length; i += 1) {
      if (flags[i] === "gap") hasGap = true;
      else if (flags[i] === "unknown") hasUnknown = true;
    }
    if (hasGap) return GAP;
    if (hasUnknown) return UNKNOWN;
    return EVIDENCE_PRESENT;
  }

  function executionRequired(answers) {
    var stage = answers.work_stage;
    var decision = answers.decision_on_table;
    if (stage === "execucao" || stage === "entrega" || stage === "operacao" || stage === "retomada") return true;
    if (decision === "iniciar_execucao" || decision === "aprovar_medicao" || decision === "aceitar_entrega" || decision === "retomar_obra") return true;
    return false;
  }

  function handoverRequired(answers) {
    var stage = answers.work_stage;
    var decision = answers.decision_on_table;
    if (stage === "entrega" || stage === "operacao" || stage === "retomada") return true;
    if (decision === "aceitar_entrega" || decision === "operar_manter" || decision === "retomar_obra") return true;
    return false;
  }

  function executionKnownNotRequired(answers) {
    if (executionRequired(answers)) return false;
    var stage = answers.work_stage;
    return stage === "planejamento" || stage === "projeto" || stage === "contratacao";
  }

  function handoverKnownNotRequired(answers) {
    if (handoverRequired(answers)) return false;
    var stage = answers.work_stage;
    return stage === "planejamento" || stage === "projeto" || stage === "contratacao" || stage === "execucao";
  }

  function domain7GapMissing(answers) {
    var parts = [];
    if (answers.art_declared === "nao_emitida_declarada") {
      parts.push("documento de ART do recorte declarado (ausência declarada nesta autoavaliação)");
    }
    if (answers.inspections_declared === "nao_registradas") {
      parts.push("registros de inspeção do recorte declarado (ausência declarada nesta autoavaliação)");
    }
    if (answers.art_declared === UNKNOWN) {
      parts.push("condição de ART ainda desconhecida");
    }
    if (answers.inspections_declared === UNKNOWN) {
      parts.push("condição de inspeções ainda desconhecida");
    }
    return parts.join("; ");
  }

  function classifyDomain(domainId, answers) {
    var flags;
    if (domainId === "decision_scope_stage") {
      flags = [
        factStatus(answers.work_stage, ["planejamento", "projeto", "contratacao", "execucao", "entrega", "operacao", "retomada"], []),
        factStatus(answers.decision_on_table, ["contratar_projeto", "contratar_execucao", "iniciar_execucao", "retomar_obra", "aprovar_medicao", "aceitar_entrega", "operar_manter"], []),
        factStatus(answers.scope_record, ["escrito_assinado"], ["escrito_sem_assinatura", "so_verbal"]),
      ];
      return { status: rollup(flags), applicability: "required" };
    }
    if (domainId === "design_set_revisions_responsibility") {
      if (answers.design_set === "nenhum" || answers.design_set === "parcial") {
        flags = ["gap"];
        if (answers.design_set === "parcial") {
          flags.push(factStatus(answers.revision_control, ["numerada_com_datas"], ["arquivos_sem_controle"]));
          flags.push(factStatus(answers.design_responsibility, ["nomeada_por_disciplina"], ["nomeada_parcial", "nao_nomeada"]));
        }
        return { status: rollup(flags), applicability: "required" };
      }
      flags = [
        factStatus(answers.design_set, ["completo_revisao_atual"], []),
        factStatus(answers.revision_control, ["numerada_com_datas"], ["arquivos_sem_controle"]),
        factStatus(answers.design_responsibility, ["nomeada_por_disciplina"], ["nomeada_parcial", "nao_nomeada"]),
      ];
      return { status: rollup(flags), applicability: "required" };
    }
    if (domainId === "quantities_budget_bases_memory") {
      flags = [
        factStatus(answers.quantities, ["takeoff_ligado_projetos"], ["planilha_sem_rastreio", "nenhum"]),
        factStatus(answers.budget, ["composicoes_e_bases"], ["preco_global_so", "nenhum"]),
        factStatus(answers.calc_memory, ["presente_ligada"], ["presente_desligada", "nenhum"]),
      ];
      return { status: rollup(flags), applicability: "required" };
    }
    if (domainId === "coordination_constructability_bim") {
      flags = [
        factStatus(answers.coordination, ["issue_register_rastreado"], ["reunioes_sem_registro", "nenhum"]),
        factStatus(
          answers.bim_or_constructability,
          ["modelo_federado_atual", "revisao_construtibilidade_registrada"],
          ["modelos_isolados", "nenhum"],
        ),
      ];
      return { status: rollup(flags), applicability: "required" };
    }
    if (domainId === "changes_execution_measurement") {
      if (executionRequired(answers)) {
        flags = [
          factStatus(answers.change_control, ["registro_escrito_com_impacto"], ["informal", "nenhum"]),
          factStatus(answers.execution_records, ["diario_e_base_medicao"], ["parcial", "nenhum"]),
          factStatus(answers.measurement_trace, ["ligada_orcamento_e_executado"], ["planilha_isolada", "nenhum"]),
        ];
        return { status: rollup(flags), applicability: "required" };
      }
      if (executionKnownNotRequired(answers)) {
        return { status: EVIDENCE_PRESENT, applicability: "not_required_at_declared_stage" };
      }
      return { status: UNKNOWN, applicability: "unknown_until_stage_or_decision_declared" };
    }
    if (domainId === "asbuilt_handover_operations") {
      if (handoverRequired(answers)) {
        flags = [
          factStatus(answers.asbuilt, ["atual"], ["desatualizado", "nenhum"]),
          factStatus(answers.handover_docs, ["manuais_garantias_ensaios"], ["parcial", "nenhum"]),
        ];
        return { status: rollup(flags), applicability: "required" };
      }
      if (handoverKnownNotRequired(answers)) {
        return { status: EVIDENCE_PRESENT, applicability: "not_required_at_declared_stage" };
      }
      return { status: UNKNOWN, applicability: "unknown_until_stage_or_decision_declared" };
    }
    if (domainId === "technical_responsibility_art_inspections") {
      flags = [
        factStatus(answers.art_declared, ["emitida_declarada", "nao_aplicavel_declarada"], ["nao_emitida_declarada"]),
        factStatus(answers.inspections_declared, ["registradas"], ["nao_registradas"]),
      ];
      return { status: rollup(flags), applicability: "required" };
    }
    throw new Error("unknown_domain:" + domainId);
  }

  function priorityFor(domainId, status, decision) {
    if (status === UNKNOWN) return PRIORITY_UNKNOWN;
    if (status === EVIDENCE_PRESENT) return PRIORITY_NONE;
    var blocking = BLOCKING_BY_DECISION[decision] || BLOCKING_BY_DECISION[UNKNOWN];
    if (blocking.indexOf(domainId) !== -1) return PRIORITY_BLOCKING;
    return PRIORITY_ATTENTION;
  }

  function domainOutput(domainId, classified, answers) {
    var meta = DOMAIN_META[domainId];
    var status = classified.status;
    var applicability = classified.applicability;
    var missing = "";
    var consequence = "";
    var next = "";
    var offer = null;
    if (applicability === "not_required_at_declared_stage") {
      missing = "Não exigido no estágio e na decisão declarados.";
      consequence = "Este domínio não entra na decisão declarada neste estágio; a exigência muda se o estágio ou a decisão mudarem.";
      next = "Reavaliar este domínio quando a obra entrar em execução, medição, entrega, operação ou retomada.";
    } else if (applicability === "unknown_until_stage_or_decision_declared") {
      missing = "Estágio ou decisão não declarados; não dá para saber se evidência deste domínio se aplica.";
      consequence = "Tratar o domínio como desconhecido, não como evidência presente, até o estágio ou a decisão serem declarados.";
      next = "Declarar o estágio da obra e a decisão que está na mesa.";
    } else if (status === EVIDENCE_PRESENT) {
      missing = "Nenhuma lacuna declarada neste domínio.";
      consequence = "A autoavaliação não substitui conferência dos documentos originais.";
      next = "Manter os documentos deste domínio localizáveis na revisão citada.";
    } else if (status === GAP) {
      missing = domainId === "technical_responsibility_art_inspections"
        ? (domain7GapMissing(answers) || meta.missing)
        : meta.missing;
      consequence = meta.consequence;
      next = meta.next;
      offer = OFFER_CANDIDATE;
    } else {
      missing = "O usuário não soube informar este domínio; ausência de resposta não prova presença nem lacuna.";
      consequence = "Não dá para apoiar a decisão neste domínio enquanto a informação permanecer desconhecida.";
      next = meta.next;
    }
    var row = {
      id: domainId,
      label: meta.label,
      status: status,
      epistemic: CALCULATION,
      applicability: applicability,
      declared_evidence: status === EVIDENCE_PRESENT ? meta.present_evidence : "",
      missing_evidence: missing,
      decision_consequence: consequence,
      consequence_epistemic: INFERENCE,
      next_verification: next,
      candidate_offer: offer,
      priority: priorityFor(domainId, status, answers.decision_on_table),
    };
    if (domainId === "technical_responsibility_art_inspections") {
      row.legal_conclusion = false;
      row.art_validity_conclusion = false;
      row.declared_condition_only = true;
      row.limits = "Condição declarada pelo usuário. Esta leitura não conclui validade de ART, regularidade, atribuição nem responsabilidade técnica.";
    }
    return row;
  }

  function compareDomainReadiness(left, right) {
    if (left === UNKNOWN || right === UNKNOWN) return 0;
    if (left === right) return 0;
    if (left === GAP && right === EVIDENCE_PRESENT) return 1;
    if (left === EVIDENCE_PRESENT && right === GAP) return -1;
    return 0;
  }

  function buildAnalyticsEvent(result) {
    return {
      tool: ENGINE_ID,
    };
  }

  function hashPayload(answers, domains) {
    var statuses = {};
    for (var i = 0; i < domains.length; i += 1) statuses[domains[i].id] = domains[i].status;
    return fnv1aHex(stableStringify({
      engine: ENGINE_ID,
      version: ENGINE_VERSION,
      answers: answers,
      statuses: statuses,
    }));
  }

  function diagnosePrivateProjectTechnicalReadiness(rawAnswers, options) {
    var opts = options && typeof options === "object" ? options : {};
    if (opts.expected_engine_id && opts.expected_engine_id !== ENGINE_ID) {
      throw new Error("engine_id_mismatch");
    }
    var answers = normalizeAnswers(rawAnswers);
    var domains = [];
    var i;
    for (i = 0; i < DOMAIN_IDS.length; i += 1) {
      domains.push(domainOutput(DOMAIN_IDS[i], classifyDomain(DOMAIN_IDS[i], answers), answers));
    }
    var unknownCount = 0;
    var gapCount = 0;
    var presentCount = 0;
    var blocking = [];
    for (i = 0; i < domains.length; i += 1) {
      if (domains[i].status === UNKNOWN) unknownCount += 1;
      else if (domains[i].status === GAP) {
        gapCount += 1;
        if (domains[i].priority === PRIORITY_BLOCKING) blocking.push(domains[i].id);
      } else presentCount += 1;
    }
    var topGap = null;
    for (i = 0; i < domains.length; i += 1) {
      if (domains[i].status === GAP && domains[i].priority === PRIORITY_BLOCKING) {
        topGap = domains[i];
        break;
      }
    }
    if (!topGap) {
      for (i = 0; i < domains.length; i += 1) {
        if (domains[i].status === GAP) {
          topGap = domains[i];
          break;
        }
      }
    }
    var namedArtifact = topGap ? ARTIFACT_BY_DOMAIN[topGap.id] : null;
    var facts = {};
    for (i = 0; i < QUESTION_IDS.length; i += 1) {
      facts[QUESTION_IDS[i]] = {
        value: answers[QUESTION_IDS[i]],
        epistemic: FACT_USER_SUPPLIED,
      };
    }
    var result = {
      engine_id: ENGINE_ID,
      engine_version: ENGINE_VERSION,
      asset_id: ASSET_ID,
      nucleus: NUCLEUS,
      offer_candidate: OFFER_CANDIDATE,
      source: SOURCE,
      outbound_eligible: OUTBOUND_ELIGIBLE,
      auto_send: AUTO_SEND,
      method: "Autoavaliação de classes fechadas. Cada resposta é fato informado pelo usuário. O estado do domínio é cálculo determinístico. A consequência decisória é inferência. Ausência de resposta permanece desconhecida.",
      limits: "Não substitui conferência dos originais, não emite ART, não valida norma e não encerra responsabilidade técnica. Autoavaliação pública não é análise documental.",
      answers: answers,
      facts: facts,
      domains: domains,
      unknown_count: unknownCount,
      gap_count: gapCount,
      present_count: presentCount,
      blocking_domains: blocking,
      priority_rule: "GAP que bloqueia a decisão declarada = PRIORITY_BLOCKING; demais GAP = PRIORITY_ATTENTION; UNKNOWN = PRIORITY_UNKNOWN (não entra no comparativo); EVIDENCE_PRESENT = PRIORITY_NONE. Não há percentual.",
      named_gap_artifact: namedArtifact,
      commercial_bridge: {
        source: SOURCE,
        source_asset_id: ASSET_ID,
        nucleus: NUCLEUS,
        offer_candidate: OFFER_CANDIDATE,
        outbound_eligible: OUTBOUND_ELIGIBLE,
        auto_send: AUTO_SEND,
        named_gap_artifact: namedArtifact,
      },
    };
    result.routing = routePrivateProjectReadiness(result);
    result.summary = summarizeReadiness(result);
    result.contact_context = buildContactContext(result);
    result.result_hash = hashPayload(answers, domains);
    var blob = stableStringify(result);
    assertSafeWording(blob, "result");
    var artDomain = domains[6];
    if (artDomain.legal_conclusion !== false || artDomain.art_validity_conclusion !== false) {
      throw new Error("domain7_legal_conclusion");
    }
    return result;
  }

  function causalDomainsForQuestion(questionId) {
    var domain = QUESTION_DOMAIN[questionId];
    var extra = [domain];
    if (questionId === "work_stage" || questionId === "decision_on_table") {
      extra.push("changes_execution_measurement");
      extra.push("asbuilt_handover_operations");
      extra.push("decision_scope_stage");
    }
    var uniq = [];
    for (var i = 0; i < extra.length; i += 1) {
      if (uniq.indexOf(extra[i]) === -1) uniq.push(extra[i]);
    }
    return uniq;
  }

  var api = {
    ENGINE_ID: ENGINE_ID,
    ENGINE_VERSION: ENGINE_VERSION,
    ASSET_ID: ASSET_ID,
    NUCLEUS: NUCLEUS,
    OFFER_CANDIDATE: OFFER_CANDIDATE,
    SOURCE: SOURCE,
    OUTBOUND_ELIGIBLE: OUTBOUND_ELIGIBLE,
    AUTO_SEND: AUTO_SEND,
    EVIDENCE_PRESENT: EVIDENCE_PRESENT,
    GAP: GAP,
    UNKNOWN: UNKNOWN,
    FACT_USER_SUPPLIED: FACT_USER_SUPPLIED,
    CALCULATION: CALCULATION,
    INFERENCE: INFERENCE,
    PRIORITY_BLOCKING: PRIORITY_BLOCKING,
    PRIORITY_ATTENTION: PRIORITY_ATTENTION,
    PRIORITY_UNKNOWN: PRIORITY_UNKNOWN,
    PRIORITY_NONE: PRIORITY_NONE,
    DOMAIN_IDS: DOMAIN_IDS,
    VOCAB: VOCAB,
    QUESTION_IDS: QUESTION_IDS,
    QUESTION_DOMAIN: QUESTION_DOMAIN,
    FORBIDDEN_CLAIMS: FORBIDDEN_CLAIMS,
    FORBIDDEN_INPUT_KEYS: FORBIDDEN_INPUT_KEYS,
    ARTIFACT_BY_DOMAIN: ARTIFACT_BY_DOMAIN,
    DOMAIN_META: DOMAIN_META,
    diagnosePrivateProjectTechnicalReadiness: diagnosePrivateProjectTechnicalReadiness,
    normalizeAnswers: normalizeAnswers,
    compareDomainReadiness: compareDomainReadiness,
    routePrivateProjectReadiness: routePrivateProjectReadiness,
    resolveCommercialDestination: resolveCommercialDestination,
    normalizeDestinationMap: normalizeDestinationMap,
    buildContactContext: buildContactContext,
    buildContactHref: buildContactHref,
    summarizeReadiness: summarizeReadiness,
    ROUTING_TABLE: ROUTING_TABLE,
    DESTINATION_MAP_SCHEMA: DESTINATION_MAP_SCHEMA,
    NEED_CODE: NEED_CODE,
    ROUTE_FAMILY: ROUTE_FAMILY,
    buildAnalyticsEvent: buildAnalyticsEvent,
    collectForbiddenClaims: collectForbiddenClaims,
    causalDomainsForQuestion: causalDomainsForQuestion,
    executionRequired: executionRequired,
    handoverRequired: handoverRequired,
    executionKnownNotRequired: executionKnownNotRequired,
    handoverKnownNotRequired: handoverKnownNotRequired,
    domain7GapMissing: domain7GapMissing,
    fnv1aHex: fnv1aHex,
    stableStringify: stableStringify,
    emptyAnswers: emptyAnswers,
  };

  root.ConfengePrivateProjectTechnicalReadiness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
