/**
 * Trust copy for the canary. Forbidden-phrase lint. Pure.
 */
const { firstCanaryCta } = require("./matrix.cjs");

const FORBIDDEN = [
  /descobrimos um problema/i,
  /encontramos uma irregularidade/i,
  /diagn[oó]stico autom[aá]tico/i,
  /(?<!sem )score de risco/i,
  /(?<!sem )score de dor/i,
  /irregularidade comprovada/i,
  /apenas hoje/i,
  /últimas vagas/i,
  /ultimas vagas/i,
  /responde em \d+/i,
  /retorno em \d+\s*(hora|dia|minuto)/i,
  /prazo de \d+/i,
  /garantimos/i,
];

function whyCnpj() {
  return "Pedimos o CNPJ para localizar contratos publicos ja publicados em que essa empresa aparece no recorte deste mercado. Nao e cadastro e nao libera a resposta acima.";
}

function whatWillBeShown() {
  return "Se o recorte tiver observacoes, mostramos carteira publica observada, orgaos, UFs e contratos. Sem score de risco, dor ou irregularidade. Se faltar dado, dizemos isso.";
}

function whatHappensNext() {
  return "A resposta publica permanece visivel. Depois do CNPJ, voce ve o estado factual (pronto, falta dado, nao encontrado, desatualizado, bloqueado ou erro). Prazo de retorno humano so existe quando for medido; hoje e UNKNOWN.";
}

function privacyNote() {
  return "O CNPJ nao entra na URL nem nas metricas agregadas. Nome, e-mail, telefone e consentimento so sao pedidos se voce pedir uma segunda leitura ou retorno comercial.";
}

function methodLimits() {
  return "Metodo: recorte SELECT-only de contratos publicos (extra-cli Goal 03 quando existir; hoje fixture rotulada, nao viva). Ticket contratual nao e custo por km. Ausencia no recorte nao e prova de inatividade nem de problema.";
}

function responderCopy() {
  return "Quem responde uma segunda leitura e a equipe CONFENGE (Tiago Sasaki) quando voce pede esse passo. Nao ha SLA publicado.";
}

function journeyCopy() {
  return {
    primary_cta: firstCanaryCta(),
    why_cnpj: whyCnpj(),
    what_will_be_shown: whatWillBeShown(),
    what_happens_next: whatHappensNext(),
    privacy: privacyNote(),
    method_limits: methodLimits(),
    responder: responderCopy(),
    sla: "UNKNOWN",
    fixture_label: "Recorte fixture. Nao e leitura ao vivo.",
  };
}

function lintCopy(text) {
  const src = String(text || "");
  const hits = [];
  for (const re of FORBIDDEN) {
    if (re.test(src)) hits.push(re.toString());
  }
  return { ok: hits.length === 0, hits };
}

function lintAllCopy() {
  const c = journeyCopy();
  const blob = Object.values(c).join("\n");
  return lintCopy(blob);
}

module.exports = {
  FORBIDDEN,
  whyCnpj,
  whatWillBeShown,
  whatHappensNext,
  privacyNote,
  methodLimits,
  responderCopy,
  journeyCopy,
  lintCopy,
  lintAllCopy,
};
