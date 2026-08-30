/**
 * Regras puras da primeira dobra (issue #327).
 *
 * O medidor `scripts/site/measure_first_fold.mjs` abre o Chrome e grava
 * coordenadas. O gate `tests/commercial/test_first_fold_contract.mjs` le o que
 * foi gravado e refaz o veredito. As duas pontas usam as funcoes deste modulo,
 * entao o censo do contrato nao pode divergir da medicao: promover uma rota a
 * mao passa a reprovar, porque o texto do registro e derivado, nao digitado.
 *
 * Nada aqui declara compreensao humana. Isto mede caixa renderizada, contagem
 * de acao e repeticao lexical. O protocolo de 3 segundos continua sendo de
 * quem o possui.
 */

export const FIRST_FOLD_ROLES = ["eyebrow", "h1", "lead", "proof", "primary_action"];
export const DESKTOP_VIEWPORT = "1366x768";
export const MOBILE_VIEWPORT = "390x844";

/**
 * Papeis por seletor. A superficie publica ja usa nomes de classe estaveis por
 * arquetipo, entao a lista fica declarada aqui e nao espalhada no HTML.
 * A ordem importa: o primeiro seletor visivel dentro do bloco do H1 vence.
 */
export const ROLE_SELECTORS = {
  eyebrow: [".hero-eyebrow", "header .eyebrow", ".report-kicker", ".eyebrow"],
  h1: ["h1"],
  lead: [".hero-lead", ".content-lead", ".section-lead", ".deliverables-lead", ".report-lead", ".lead"],
  proof: [
    ".hero-proof-line",
    ".offer-proof-line",
    ".report-proof-line",
    ".section-proof",
    ".hero-proof",
    ".report-hero-result",
    ".deliverables-status",
  ],
  primary_action: ["a.button-primary", "button.button-primary", "a.button-lg", "form button[type='submit']"],
};

const STOPWORDS = new Set([
  "para", "pelo", "pela", "pelos", "pelas", "como", "quando", "onde", "que", "com", "sem",
  "dos", "das", "nos", "nas", "por", "uma", "uns", "umas", "seu", "sua", "seus", "suas",
  "mais", "menos", "muito", "cada", "todo", "toda", "todos", "todas", "esse", "essa",
  "este", "esta", "isso", "aquilo", "ainda", "entre", "antes", "depois", "sobre", "voce",
  "nao", "sim", "ser", "estao", "tem", "ter", "faz", "fazer", "vai", "sao",
]);

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function contentWords(text) {
  return new Set(
    String(text || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(COMBINING_MARKS, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  );
}

/**
 * Eyebrow, H1 e lead nao podem repetir a mesma categoria sem acrescentar
 * informacao. Teste operacional e conservador: cada campo precisa trazer ao
 * menos uma palavra de conteudo que os campos anteriores nao trouxeram.
 */
export function categoryRepetition({ eyebrow, h1, lead }) {
  const eyebrowWords = contentWords(eyebrow);
  const h1Words = contentWords(h1);
  const leadWords = contentWords(lead);
  const eyebrowNew = [...eyebrowWords].filter((word) => !h1Words.has(word)).sort();
  const seen = new Set([...eyebrowWords, ...h1Words]);
  const leadNew = [...leadWords].filter((word) => !seen.has(word)).sort();

  let reason = "cada_campo_acrescenta_palavra_de_conteudo";
  let ok = true;
  if (!eyebrowWords.size) { ok = false; reason = "eyebrow_vazio"; }
  else if (!h1Words.size) { ok = false; reason = "h1_vazio"; }
  else if (!leadWords.size) { ok = false; reason = "lead_vazio"; }
  else if (!eyebrowNew.length) { ok = false; reason = "eyebrow_contido_no_h1"; }
  else if (!leadNew.length) { ok = false; reason = "lead_sem_informacao_nova"; }
  return { ok, reason, eyebrow_new: eyebrowNew, lead_new: leadNew };
}

/**
 * Texto do bloqueio, derivado do plano de destravamento e nao digitado a mao.
 * Uma rota so pode ficar MEASURED_FAIL apontando um dono e uma data.
 */
export function blockerText(unlockPlan) {
  return (
    `#${unlockPlan.issue} congela o HTML dos seis pilares BOFU e o styles.css como colateral de ` +
    `renderização até ${unlockPlan.earliest_safe_action_at}, com html_mutation_authorized=false`
  );
}

export function frozenRoutes(unlockPlan) {
  return new Set((unlockPlan.protected_pillars || []).map((slug) => `/${slug}/`));
}

export function boxOfRole(routeMeasurement, viewport, role) {
  return routeMeasurement.viewports?.[viewport]?.roles?.[role]?.box || null;
}

/**
 * Veredito de uma rota. Lista vazia significa MEASURED_PASS.
 */
export function foldProblems(routeMeasurement) {
  const problems = [];
  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    const height = Number(viewport.split("x")[1]);
    const view = routeMeasurement.viewports?.[viewport];
    if (!view) {
      problems.push(`${viewport}:medicao_ausente`);
      continue;
    }
    for (const role of FIRST_FOLD_ROLES) {
      const box = boxOfRole(routeMeasurement, viewport, role);
      if (!box) problems.push(`${viewport}:${role}=ausente`);
      else if (box.bottom > height || box.top < 0) problems.push(`${viewport}:${role}=${box.top}-${box.bottom}`);
      else if (box.bottom <= box.top) problems.push(`${viewport}:${role}=caixa_sem_altura`);
    }
    if ((view.primary_actions_in_fold || []).length !== 1) {
      problems.push(`${viewport}:primarias=${(view.primary_actions_in_fold || []).length}`);
    }
    if (view.horizontal_overflow) problems.push(`${viewport}:overflow`);
  }
  if (!routeMeasurement.category_repetition?.ok) {
    problems.push(`repeticao:${routeMeasurement.category_repetition?.reason || "ausente"}`);
  }
  return problems;
}

export function passFinding(routeMeasurement) {
  const h1 = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "h1");
  const proof = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "proof");
  const desktopAction = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "primary_action");
  const mobileAction = boxOfRole(routeMeasurement, MOBILE_VIEWPORT, "primary_action");
  return (
    `H1 de y=${h1.top} a y=${h1.bottom}; ` +
    `linha de prova de y=${proof.top} a y=${proof.bottom}; ` +
    `ação primária inteira de y=${desktopAction.top} a y=${desktopAction.bottom} em ${DESKTOP_VIEWPORT}, ` +
    `e de y=${mobileAction.top} a y=${mobileAction.bottom} em ${MOBILE_VIEWPORT}, dentro da dobra nos dois`
  );
}

export function failFinding(routeMeasurement) {
  const h1 = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "h1");
  const parts = [`H1 de y=${h1.top} a y=${h1.bottom} em ${DESKTOP_VIEWPORT}`];
  const desktopProof = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "proof");
  const mobileProof = boxOfRole(routeMeasurement, MOBILE_VIEWPORT, "proof");
  if (!desktopProof && !mobileProof) {
    parts.push(`nenhuma linha de prova conferível na dobra em ${DESKTOP_VIEWPORT} nem em ${MOBILE_VIEWPORT}`);
  } else {
    if (mobileProof && mobileProof.bottom > 844) {
      parts.push(`linha de prova de y=${mobileProof.top} a y=${mobileProof.bottom} em ${MOBILE_VIEWPORT}, fora da dobra de 844`);
    }
    if (desktopProof && desktopProof.bottom > 768) {
      parts.push(`linha de prova de y=${desktopProof.top} a y=${desktopProof.bottom} em ${DESKTOP_VIEWPORT}, fora da dobra de 768`);
    }
  }
  const mobileAction = boxOfRole(routeMeasurement, MOBILE_VIEWPORT, "primary_action");
  if (mobileAction && mobileAction.bottom > 844) {
    parts.push(`ação primária inteira de y=${mobileAction.top} a y=${mobileAction.bottom} em ${MOBILE_VIEWPORT}, fora da dobra de 844`);
  }
  const desktopAction = boxOfRole(routeMeasurement, DESKTOP_VIEWPORT, "primary_action");
  if (desktopAction && desktopAction.bottom > 768) {
    parts.push(`ação primária inteira de y=${desktopAction.top} a y=${desktopAction.bottom} em ${DESKTOP_VIEWPORT}, fora da dobra de 768`);
  }
  return parts.join("; ");
}

export function decidingViewport(problems) {
  return problems.some((problem) => problem.startsWith(MOBILE_VIEWPORT)) ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
}

export function measurementRecord(routeMeasurement, blocker) {
  const problems = foldProblems(routeMeasurement);
  if (!problems.length) {
    return {
      state: "MEASURED_PASS",
      record: { date: routeMeasurement.measured_on, viewport: DESKTOP_VIEWPORT, finding: passFinding(routeMeasurement) },
    };
  }
  return {
    state: "MEASURED_FAIL",
    record: {
      date: routeMeasurement.measured_on,
      viewport: decidingViewport(problems),
      finding: failFinding(routeMeasurement),
      blocker,
    },
  };
}
