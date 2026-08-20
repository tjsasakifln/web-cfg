"use strict";

const { ASSET } = require("./constants.cjs");

function joinSplit(parts) {
  return parts.join("");
}

function forbiddenPatterns() {
  const tokens = [
    joinSplit(["empresa ", "lim", "pa"]),
    joinSplit(["id", "onea"]),
    joinSplit(["id", "oneo"]),
    joinSplit(["id", "\u00f4nea"]),
    joinSplit(["id", "\u00f4neo"]),
    joinSplit(["aprova", "da"]),
    joinSplit(["aprova", "do"]),
    joinSplit(["sem ", "risco"]),
    joinSplit(["certid", "ao"]),
    joinSplit(["certid", "\u00e3o"]),
    joinSplit(["ap", "ta"]),
    joinSplit(["ap", "to"]),
    joinSplit(["recomen", "dada"]),
    joinSplit(["recomen", "dado"]),
    joinSplit(["nada ", "consta"]),
    joinSplit(["empresa ", "reg", "ular"]),
    joinSplit(["fraude ", "infer"]),
    joinSplit(["impedimento ", "infer"]),
  ];
  return tokens.map((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
}

function extraForbidden() {
  return [
    /\bempresa limpa\b/i,
    /\bsem registros\b/i,
    /\bcontratar automaticamente\b/i,
    /\brejeitar automaticamente\b/i,
    /\bscore de risco\b/i,
    /\bemite conclus[aã]o jur[ií]dica\b/i,
    /\be uma conclus[aã]o jur[ií]dica\b/i,
  ];
}

function scanForbiddenCopy(text) {
  const src = String(text || "");
  const hits = [];
  for (const re of forbiddenPatterns().concat(extraForbidden())) {
    const match = src.match(re);
    if (match) hits.push(match[0]);
  }
  if (/\bregular\b/i.test(src) && /\bempresa\b/i.test(src)) {
    const m = src.match(/\bempresa\s+regular\b/i);
    if (m) hits.push(m[0]);
  }
  return hits;
}

function journeyCopy() {
  return {
    eyebrow: "Consulta preliminar de ocorrencias publicas",
    title: "Consulta preliminar de ocorrencias publicas em CEIS e CNEP",
    lead:
      "Informe um CNPJ de forma privada e veja o que os cadastros CEIS e CNEP do Portal da Transparencia registram neste instante, com cobertura e limites visiveis.",
    preliminary:
      "Esta consulta e preliminar. Ela descreve ocorrencias observadas nas fontes contratadas; nao substitui diligencia documental humana.",
    sources_covered:
      "Fontes cobertas nesta versao: CEIS (Cadastro Nacional de Empresas Inidoneas e Suspensas) e CNEP (Cadastro Nacional de Empresas Punidas), ambos do Portal da Transparencia / CGU.",
    absence_not_general:
      "Ausencia confirmada nestas duas fontes, mesmo com cobertura completa, nao prova ausencia geral de risco, de outros cadastros ou de impedimentos fora deste recorte.",
    unavailability_visible:
      "Se uma fonte nao responder, esgotar limite de pedidos, atrasar ou devolver leitura incompleta, esse estado permanece visivel. Falha tecnica nunca vira lista vazia.",
    why_cnpj:
      "O CNPJ identifica o sancionado nos cadastros oficiais. Ele e enviado so no corpo da requisicao, permanece no servidor pelo TTL da consulta e nao entra na URL, no titulo, no analytics nem em logs indexaveis.",
    what_will_be_shown:
      "O resultado mostra o estado agregado, um cartao por fonte, ocorrencias observadas com localizador oficial quando o envelope permitir, cobertura, instante (as_of), metodo e limites. Sem pontuacao e sem decisao de contratar ou recusar parceiro.",
    method:
      "Metodo: consumo fail-closed do contrato public-read-integrity/1.0 (SELECT-only). CEIS e CNEP sao consultados em separado, com paginacao ate pagina terminal bem sucedida. O agregado so confirma ausencia quando as duas fontes e todas as paginas completam vazias.",
    limitations: [
      "Consulta limitada aos cadastros CEIS e CNEP do Portal da Transparencia.",
      "Cadastros nao contratados nao entram na conclusao.",
      "Valor ausente nao e fato negativo.",
      "Ocorrencias observadas nao constituem conclusao juridica, certificacao ou recomendacao.",
    ],
    correction: "Se um fato publicado estiver errado, use o canal de correcoes da CONFENGE.",
    author_line: `Autor: ${ASSET.author}. Revisor: ${ASSET.reviewer}.`,
    next_action_matches:
      "Ha ocorrencias observadas nestas fontes. A proxima acao e diligencia documental humana (atos, prazos e pecas oficiais) antes de qualquer decisao comercial.",
    next_action_empty:
      "As fontes contratadas completaram vazias neste instante. Isso nao encerra a diligencia: confira outros cadastros, documentos e o contexto do parceiro com revisao humana.",
    next_action_partial:
      "A leitura ficou parcial. Trate as ocorrencias visiveis como observadas e as fontes incompletas como nao lidas. Nao interprete o silencio de uma fonte como ausencia.",
    next_action_unknown:
      "Nao foi possivel concluir a leitura. O estado permanece indefinido. Repita a consulta quando as fontes responderem ou siga para diligencia humana com o recorte incompleto visivel.",
    cta: {
      id: ASSET.cta_id,
      version: ASSET.cta_version,
      label: "Pedir diligencia humana (diagnostico B2G 360)",
      href: "/diagnostico-b2g-360/",
      destination_service_id: ASSET.destination_service_id,
    },
    privacy:
      "O CNPJ nao entra na URL, no fragmento, no titulo, no canonical, no analytics nem no referrer. O resultado individual permanece noindex e fora do sitemap.",
    fixture_note:
      "Nesta onda a prova de dados e um envelope rotulado, nao uma leitura ao vivo com chave do Portal.",
    flag_off_note:
      "A consulta permanece fechada ao publico (flag desligada). Esta pagina explica o metodo e nao publica utilidade factual ainda nao comprovada por canario com chave.",
    state_labels: {
      MATCHES_FOUND: "Ocorrencias observadas nestas fontes",
      NO_MATCH_CONFIRMED:
        "Nenhuma ocorrencia observada nas fontes consultadas, com cobertura completa neste instante",
      PARTIAL: "Leitura parcial: pelo menos uma fonte nao completou",
      UNKNOWN: "Nao foi possivel concluir a leitura",
    },
  };
}

function nextActionFor(state) {
  const c = journeyCopy();
  if (state === "MATCHES_FOUND") return c.next_action_matches;
  if (state === "NO_MATCH_CONFIRMED") return c.next_action_empty;
  if (state === "PARTIAL") return c.next_action_partial;
  return c.next_action_unknown;
}

function lintCopy(text) {
  const hits = scanForbiddenCopy(text);
  return { ok: hits.length === 0, hits };
}

function lintAllCopy() {
  const c = journeyCopy();
  const blob = JSON.stringify(c);
  return lintCopy(blob);
}

module.exports = {
  journeyCopy,
  nextActionFor,
  scanForbiddenCopy,
  lintCopy,
  lintAllCopy,
  forbiddenPatterns,
};
