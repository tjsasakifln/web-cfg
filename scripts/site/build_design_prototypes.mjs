/**
 * Build the two isolated design-direction prototypes compared by issue #494.
 *
 * The comparison protocol (DESIGN_DIRECTION_BRIEF_2026-08-30 §11) requires
 * fixed content: same text, same data, same sources across variants. Copy
 * therefore lives once, in `docs/design-audit/prototypes/fixed-content.json`,
 * and both variants are rendered from it by this one generator. The only thing
 * a variant may change is its signature — the element carrying
 * `data-signature` — and its own `mechanism.css`. Everything else, including
 * the whole conversion subtree, is emitted by the same functions for both, so
 * `scripts/site/test_design_prototypes.mjs` can assert that the non-signature
 * text is byte-identical between A and B.
 *
 *   A — trilho de memória: the numeric column is the layout engine. Fonte,
 *       data de corte, artigo, unidade and versão sit on the claim's baseline.
 *       A claim without provenance renders visibly incomplete, never hidden.
 *   B — estado de revisão: the revision state governs rendering. A claim whose
 *       data de corte has expired renders degraded and marked, automatically;
 *       a claim without a data de corte is born marked. No drawn carimbo.
 *
 * Output lives under `docs/design-audit/prototypes/**`, the single path the
 * build excludes from `_site` (scripts/pseo/build_site.py, issue #507 P4).
 *
 * Usage: node scripts/site/build_design_prototypes.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const PROTOTYPE_DIR = join(ROOT, "docs/design-audit/prototypes");
export const CONTENT_PATH = join(PROTOTYPE_DIR, "fixed-content.json");

export const VARIANTS = Object.freeze({
  a: { slug: "a-trilho-de-memoria", nome: "A — Trilho de memória" },
  b: { slug: "b-estado-de-revisao", nome: "B — Estado de revisão" },
});

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** ISO date -> `15/08/2026`. PT-BR order, zero padded, never a bare ISO string. */
export function dataBr(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function dataExtenso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${y}`;
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Revision state of one claim, derived — never authored.
 *
 * `sem-data` is the born-marked state of mechanism B: a claim with no declared
 * data de corte cannot enter the valid state at all.
 */
export function revisionState(claim, { today, validadeDias }) {
  if (!claim.data_de_corte) return "sem-data";
  return daysBetween(claim.data_de_corte, today) > validadeDias ? "vencida" : "valida";
}

/** The provenance fields a claim actually carries, of the five M1 measures. */
export function provenanceOf(claim) {
  return {
    fonte: claim.fonte ? claim.fonte.nome : null,
    data_de_corte: claim.data_de_corte ? dataBr(claim.data_de_corte) : null,
    unidade: claim.numero ? claim.numero.unidade : null,
    responsavel: claim.responsavel || null,
    versao: claim.versao || null,
  };
}

const NATUREZA_ROTULO = {
  fato: "Fato",
  calculo: "Cálculo",
  inferencia: "Inferência",
  lacuna: "Lacuna",
  acao: "Ação",
};

/* ------------------------------------------------------------------ */
/* Shared chrome — emitted identically for both variants               */
/* ------------------------------------------------------------------ */

function head({ job, variant, title, depth = 2 }) {
  const up = "../".repeat(depth);
  return `<!DOCTYPE html>
<html lang="pt-BR" data-prototype="${esc(variant.slug)}" data-job="${esc(job.id)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow,noarchive"/>
<title>${esc(title)}</title>
<link rel="stylesheet" href="/styles-tokens.css"/>
<link rel="stylesheet" href="${up}base.css"/>
<link rel="stylesheet" href="${"../".repeat(depth - 1)}mechanism.css"/>
</head>
<body>
<a class="skip-link" href="#conteudo">Ir ao conteúdo</a>
<p class="proto-banner">Protótipo isolado de #494 · não é rota pública · conteúdo fixo do protocolo de comparação</p>`;
}

function pageHead(job) {
  return `<header class="page-head">
<p class="eyebrow">${esc(job.eyebrow)}</p>
<h1>${esc(job.h1)}</h1>
<p class="lead">${esc(job.lead)}</p>
</header>`;
}

/**
 * The terminal action and the price↔capture pair.
 *
 * Emitted by one function for both variants, so conversion is literally the
 * same subtree in A and in B (§5.2 of the pre-registered decision rule:
 * conversion is never the variable).
 */
function conversionLockup(job) {
  const oferta = job.oferta
    ? `<div class="oferta" data-conversion="preco">
<p class="oferta__unidade">${esc(job.oferta.unidade_nome)}</p>
<h2 class="oferta__titulo">${esc(job.oferta.titulo)}</h2>
<p class="oferta__resumo">${esc(job.oferta.resumo)}</p>
<dl class="oferta__lockup">
<div><dt>Preço-piloto</dt><dd class="num">${esc(job.oferta.preco)}</dd></div>
<div><dt>Unidade</dt><dd>${esc(job.oferta.preco_unidade)}</dd></div>
<div><dt>SLA</dt><dd class="num">${esc(job.oferta.sla)}</dd></div>
</dl>
</div>`
    : "";
  return `<section class="conversion" id="acao" aria-labelledby="acao-titulo" data-conversion="lockup">
<h2 class="sr-only" id="acao-titulo">Próxima ação</h2>
${oferta}
<p class="conversion__actions">
<a class="button button-primary" href="${esc(job.acao_terminal.href)}" data-conversion="terminal">${esc(job.acao_terminal.label)}</a>
<a class="button button-ghost" href="${esc(job.acao_secundaria.href)}">${esc(job.acao_secundaria.label)}</a>
</p>
</section>`;
}

/** The capture form. Identical markup in both variants; never a variable. */
function capture(job) {
  return `<section class="captura" id="captura" aria-labelledby="captura-titulo" data-conversion="captura">
<h2 id="captura-titulo">${esc(job.captura.titulo)}</h2>
<p>${esc(job.captura.lead)}</p>
<form class="form" data-prototype-form novalidate>
<div class="field">
<label for="f-contrato">Número ou apelido do contrato</label>
<p class="field__help" id="f-contrato-help">Como o contrato é chamado internamente. Não precisa ser o número oficial.</p>
<input id="f-contrato" name="contrato" type="text" aria-describedby="f-contrato-help" autocomplete="off"/>
</div>
<div class="field" data-state="error">
<label for="f-evento">O que aconteceu, e quando</label>
<p class="field__help" id="f-evento-help">Uma linha por evento, com a data em que foi registrado.</p>
<textarea id="f-evento" name="evento" rows="3" aria-describedby="f-evento-help f-evento-erro" aria-invalid="true"></textarea>
<p class="field__error" id="f-evento-erro">Informe pelo menos um evento com data. Sem data não dá para montar cronologia.</p>
</div>
<p class="field__turnstile" data-turnstile-slot>Verificação anti-abuso ocupa este bloco na página real. O protótipo não carrega widget de terceiro.</p>
<p class="form__actions"><button class="button button-primary" type="button" data-conversion="submit">${esc(job.acao_terminal.label)}</button></p>
<p class="form__success" role="status">${esc(job.acao_terminal.confirmacao)} — retorno em até 1 dia útil.</p>
</form>
</section>`;
}

function footer(job, variant, meta) {
  return `<footer class="page-foot">
<p>Protótipo <strong>${esc(variant.nome)}</strong> · job <strong>${esc(job.job)}</strong> · espelha ${esc(job.mirror_route)}</p>
<p>Conteúdo fixo de <code>docs/design-audit/prototypes/fixed-content.json</code>, data de referência ${esc(dataBr(meta.today))}.</p>
</footer>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Claim bodies — the only place the two variants diverge              */
/* ------------------------------------------------------------------ */

function claimProse(claim) {
  return `<p class="claim__natureza">${esc(NATUREZA_ROTULO[claim.natureza])}</p>
<p class="claim__text">${esc(claim.text)}</p>
${claim.evidencia ? `<p class="claim__evidencia"><span class="claim__evidencia-rotulo">Evidência</span> ${esc(claim.evidencia)}</p>` : ""}`;
}

function numeroCell(claim) {
  if (!claim.numero) {
    return `<p class="claim__numero claim__numero--vazio" aria-hidden="true">—</p>`;
  }
  return `<p class="claim__numero"><span class="claim__valor num">${esc(claim.numero.valor)}</span></p>`;
}

/**
 * A — trilho de memória.
 *
 * The rail carries fonte, data de corte, artigo, unidade and versão, which is
 * exactly the field list mechanism A declares in §5 of the brief. Responsável
 * is not a rail field there, so it is not stuffed into the rail here: it stays
 * where it already is on the shipped site, in the page's authorship line.
 * A rail cell with no data prints the missing field's name, so the claim reads
 * as incomplete instead of reading as finished.
 */
function trilho(claim) {
  const rows = [
    ["Fonte", claim.fonte ? claim.fonte.nome : null],
    ["Data de corte", claim.data_de_corte ? dataBr(claim.data_de_corte) : null],
    ["Artigo", claim.artigo],
    ["Unidade", claim.numero ? claim.numero.unidade : null],
    ["Versão", claim.versao],
  ];
  const items = rows.map(([rotulo, valor]) => (valor
    ? `<div class="trilho__row"><dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd></div>`
    : `<div class="trilho__row trilho__row--lacuna"><dt>${esc(rotulo)}</dt><dd>sem ${esc(rotulo.toLowerCase())}</dd></div>`)).join("\n");
  const faltando = rows.filter(([, valor]) => !valor).length;
  return `<dl class="trilho" id="trilho-${esc(claim.id)}" data-signature="trilho" data-lacunas="${faltando}">
${items}
</dl>`;
}

function claimA(claim) {
  const faltando = [
    claim.fonte, claim.data_de_corte, claim.artigo,
    claim.numero ? claim.numero.unidade : null, claim.versao,
  ].filter((v) => !v).length;
  const incompleta = faltando > 0;
  return `<article class="claim" id="${esc(claim.id)}" data-natureza="${esc(claim.natureza)}"${incompleta ? ' data-incompleta="sim"' : ""}>
${numeroCell(claim)}
<div class="claim__prosa">
${claimProse(claim)}
${incompleta ? `<p class="claim__incompleta">Afirmação incompleta: ${faltando} de 5 campos de proveniência não foram declarados. Ver <a href="#trilho-${esc(claim.id)}">o trilho desta afirmação</a>.</p>` : ""}
</div>
${trilho(claim)}
</article>`;
}

/**
 * B — estado de revisão.
 *
 * The signature is the derived state, not a drawing. §5 of the brief says
 * frescor, versão and responsável stop being text and become state, so those
 * three are what the state block carries. Fonte and unidade are not state
 * fields under B, so they stay in the prose where the shipped site already
 * puts them — they are not moved into the signature to inflate the ablation.
 *
 * There is no carimbo: no four-sided box, no rotated text, no corner block, no
 * title-block cell grid. The marker is a leading status line plus a start-edge
 * keyline, and it says the state in words before it says it in colour.
 */
function estado(claim, state, meta) {
  if (state === "sem-data") {
    return `<p class="estado estado--sem-data" role="status" data-signature="estado" data-estado="sem-data">
<span class="estado__glifo" aria-hidden="true">×</span>
<span class="estado__texto">Sem data de corte declarada — nasce marcada. Versão ${esc(claim.versao || "não declarada")} · responsável ${esc(claim.responsavel)}.</span>
</p>`;
  }
  if (state === "vencida") {
    const venceu = new Date(Date.parse(`${claim.data_de_corte}T00:00:00Z`) + meta.validadeDias * 86400000)
      .toISOString().slice(0, 10);
    return `<p class="estado estado--vencida" role="status" data-signature="estado" data-estado="vencida">
<span class="estado__glifo" aria-hidden="true">!</span>
<span class="estado__texto">Revisão vencida em ${esc(dataBr(venceu))} — data de corte ${esc(dataBr(claim.data_de_corte))}, versão ${esc(claim.versao)}, responsável ${esc(claim.responsavel)}. Verificar antes de usar.</span>
</p>`;
  }
  return `<p class="estado estado--valida" role="status" data-signature="estado" data-estado="valida">
<span class="estado__glifo" aria-hidden="true">·</span>
<span class="estado__texto">Revisão válida — data de corte ${esc(dataBr(claim.data_de_corte))}, versão ${esc(claim.versao)}, responsável ${esc(claim.responsavel)}.</span>
</p>`;
}

function claimB(claim, meta) {
  const state = revisionState(claim, meta);
  return `<article class="claim" id="${esc(claim.id)}" data-natureza="${esc(claim.natureza)}" data-revision-state="${esc(state)}">
${estado(claim, state, meta)}
${numeroCell(claim)}
<div class="claim__prosa">
${claimProse(claim)}
${claim.fonte ? `<p class="claim__fonte"><span class="claim__evidencia-rotulo">Fonte</span> ${esc(claim.fonte.nome)}${claim.artigo ? ` · ${esc(claim.artigo)}` : ""}${claim.numero ? ` · unidade: ${esc(claim.numero.unidade)}` : ""}</p>` : `<p class="claim__fonte claim__fonte--ausente"><span class="claim__evidencia-rotulo">Fonte</span> não declarada</p>`}
</div>
</article>`;
}

/** Page-level state block for B. Carries the page's own frescor, versão, responsável. */
function estadoPagina(job, meta) {
  const states = job.claims.map((c) => revisionState(c, meta));
  const foraDaValidade = states.filter((s) => s !== "valida").length;
  const cortes = job.claims.map((c) => c.data_de_corte).filter(Boolean).sort();
  const maisAntiga = cortes[0];
  const estadoPag = foraDaValidade > 0 ? "degradada" : "valida";
  return `<p class="estado-pagina estado--${esc(estadoPag)}" role="status" data-signature="estado-pagina" data-estado="${esc(estadoPag)}">
<span class="estado__glifo" aria-hidden="true">${foraDaValidade > 0 ? "!" : "·"}</span>
<span class="estado__texto">Estado de revisão desta página: <strong>${foraDaValidade > 0 ? "degradada" : "válida"}</strong> — ${esc(String(foraDaValidade))} de ${esc(String(job.claims.length))} afirmações fora da validade. Data de corte mais antiga ${esc(dataBr(maisAntiga))} · versão ${esc(job.versao)} · responsável ${esc(job.responsavel)}.</span>
</p>`;
}

/** Authorship line. Identical in both variants — A does not put it in the rail. */
function autoria(job) {
  return `<p class="autoria">Responsável técnico: ${esc(job.responsavel)} · protocolo ${esc(job.protocolo)} · versão ${esc(job.versao)}</p>`;
}

/* ------------------------------------------------------------------ */
/* Page assembly                                                       */
/* ------------------------------------------------------------------ */

function renderPage({ job, variantKey, meta }) {
  const variant = VARIANTS[variantKey];
  const claims = job.claims
    .map((claim) => (variantKey === "a" ? claimA(claim) : claimB(claim, meta)))
    .join("\n");
  const estadoBloco = variantKey === "b" ? estadoPagina(job, meta) : "";
  return [
    head({ job, variant, title: `${job.h1} — ${variant.nome}` }),
    `<main id="conteudo">`,
    pageHead(job),
    estadoBloco,
    autoria(job),
    conversionLockup(job),
    `<section class="claims" id="metodo" aria-labelledby="claims-titulo">`,
    `<h2 id="claims-titulo">O que sustenta esta página</h2>`,
    claims,
    `</section>`,
    capture(job),
    `</main>`,
    footer(job, variant, meta),
  ].join("\n");
}

/**
 * G1 ablation: the same template with every domain slot null.
 *
 * Nothing is invented here — the claims are stripped of fonte, data de corte,
 * artigo, unidade, responsável, protocolo and versão and re-rendered, so the
 * gate can ask whether the page still renders intact without them.
 */
export function nullDomainSlots(job) {
  return {
    ...job,
    responsavel: null,
    protocolo: null,
    versao: null,
    claims: job.claims.map((claim) => ({
      ...claim,
      artigo: null,
      fonte: null,
      data_de_corte: null,
      versao: null,
      responsavel: null,
      numero: claim.numero ? { ...claim.numero, unidade: null } : null,
      evidencia: null,
    })),
  };
}

function renderNulled({ job, variantKey, meta }) {
  const stripped = nullDomainSlots(job);
  const variant = VARIANTS[variantKey];
  const claims = stripped.claims
    .map((claim) => (variantKey === "a" ? claimA(claim) : claimB(claim, meta)))
    .join("\n");
  return [
    head({ job: stripped, variant, title: `G1 · slots nulos — ${variant.nome}`, depth: 3 }),
    `<main id="conteudo">`,
    pageHead(stripped),
    variantKey === "b" ? estadoPagina(stripped, meta) : "",
    `<p class="autoria autoria--ausente">Responsável técnico não declarado · protocolo não declarado · versão não declarada</p>`,
    conversionLockup(stripped),
    `<section class="claims" id="metodo" aria-labelledby="claims-titulo">`,
    `<h2 id="claims-titulo">O que sustenta esta página</h2>`,
    claims,
    `</section>`,
    capture(stripped),
    `</main>`,
    footer(stripped, variant, meta),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Typographic specimen — the nine acceptance artefacts of §6          */
/* ------------------------------------------------------------------ */

function specimen({ spec, job, variantKey, meta }) {
  const variant = VARIANTS[variantKey];
  const linhas = spec.tabela_preco.map((row) => `<tr>
<th scope="row">${esc(row.linha)}</th>
<td class="num">${esc(row.valor)}</td>
<td class="num">${esc(row.pct)}</td>
</tr>`).join("\n");
  return `${head({ job: { ...job, id: "specimen" }, variant, title: `Specimen — ${variant.nome}` })}
<main id="conteudo" class="specimen">
<header class="page-head">
<p class="eyebrow">Artefato 1 · H1 real de money page</p>
<h1>${esc(job.h1)}</h1>
<p class="lead">${esc(spec.titulo)}</p>
</header>

<section class="spec-block" id="a2">
<h2>Artefato 2 · parágrafo de 68ch com diacríticos densos</h2>
<p class="measure" data-specimen="paragrafo">${esc(spec.paragrafo_68ch)}</p>
</section>

<section class="spec-block" id="a3">
<h2>Artefato 3 e 4 · tabela de preço R$ com milhar “.” e decimal “,”, e coluna de percentual com sinal</h2>
<table class="tabela-dado" data-specimen="tabela">
<caption>Base do contrato e limites do art. 125, em reais e em porcentagem do valor inicial atualizado.</caption>
<thead><tr><th scope="col">Linha</th><th scope="col" class="num">R$</th><th scope="col" class="num">% da base</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table>
</section>

<section class="spec-block" id="a5">
<h2>Artefato 5 · bloco de metadado</h2>
<dl class="metadado" data-specimen="metadado">
<div class="trilho__row"><dt>Fonte</dt><dd>Lei nº 14.133/2021 (texto compilado, Planalto)</dd></div>
<div class="trilho__row"><dt>Data de corte</dt><dd>15/08/2026</dd></div>
<div class="trilho__row"><dt>Versão</dt><dd>compilado 2026-08-15</dd></div>
<div class="trilho__row"><dt>Status</dt><dd>revisão válida</dd></div>
</dl>
</section>

<section class="spec-block" id="a6">
<h2>Artefato 6 · rótulo, erro e estado vazio de formulário</h2>
<div class="field" data-specimen="campo">
<label for="s-base">Base do contrato</label>
<p class="field__help" id="s-base-help">Valor inicial atualizado, em reais.</p>
<input id="s-base" type="text" value="12.480.500,00" aria-describedby="s-base-help" class="num"/>
</div>
<div class="field" data-state="error" data-specimen="erro">
<label for="s-acr">Acréscimos já formalizados</label>
<input id="s-acr" type="text" value="" aria-describedby="s-acr-erro" aria-invalid="true" class="num"/>
<p class="field__error" id="s-acr-erro">Informe o total já formalizado. Sem esse valor o saldo não pode ser calculado.</p>
</div>
<p class="estado-vazio" data-specimen="vazio">Nenhum acréscimo formalizado até aqui. Informe a base e a alteração em análise para ver o saldo.</p>
</section>

<section class="spec-block" id="a7">
<h2>Artefato 7 · o número dominante da página, com portador não-cromático</h2>
<p class="numero-dominante"><span class="num">1.123.245,00</span></p>
<p class="numero-dominante__portador"><span aria-hidden="true">→</span> Saldo de acréscimo em reais · art. 125 · data de corte 15/08/2026. O portador do significado é a palavra e a posição na coluna, não a cor.</p>
</section>

<section class="spec-block" id="a8">
<h2>Artefato 8 · tudo repetido em cinza 100%</h2>
<div class="cinza" data-specimen="cinza">
<p class="numero-dominante"><span class="num">1.123.245,00</span></p>
<p class="claim__natureza">Cálculo</p>
<p class="estado estado--vencida"><span class="estado__glifo" aria-hidden="true">!</span><span class="estado__texto">Revisão vencida em 29/05/2026 — verificar antes de usar.</span></p>
<p class="estado estado--valida"><span class="estado__glifo" aria-hidden="true">·</span><span class="estado__texto">Revisão válida — data de corte 15/08/2026.</span></p>
<p><a class="button button-primary" href="#acao">${esc(job.acao_terminal.label)}</a></p>
</div>
</section>

<section class="spec-block" id="a9">
<h2>Artefato 9 · glifos exigidos, confusáveis e manifesto de arquivos</h2>
<p class="glifos" data-specimen="glifos">${esc(spec.glifos)}</p>
<p class="glifos" data-specimen="confusaveis">${esc(spec.confusaveis)}</p>
<table class="tabela-dado" data-specimen="manifesto">
<caption>Manifesto tipográfico do candidato.</caption>
<thead><tr><th scope="col">Família</th><th scope="col">Papel</th><th scope="col" class="num">Arquivos</th><th scope="col" class="num">KB gzip</th></tr></thead>
<tbody>
<tr><th scope="row">nenhuma (pilha de sistema)</th><td>tese · leitura · dado · nota</td><td class="num">0</td><td class="num">0,0</td></tr>
</tbody>
<tfoot><tr><th scope="row">Total</th><td>teto ≤6 arquivos · ≤90 KB gzip</td><td class="num">0</td><td class="num">0,0</td></tr></tfoot>
</table>
<p>Nenhuma das duas candidatas propõe webfont: o orçamento de fonte em <code>data/site/design-system.json</code> é <code>font_files_max: 0</code> e <code>font_total_gzip_kb_max: 0</code>, e nenhum ativo de terceiro é versionado nesta issue. O delta de CLS contra a pilha atual é, por construção, zero.</p>
</section>
${footer(job, variant, meta)}`;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Base stylesheet — identical for both variants.
 *
 * It reuses `/styles-tokens.css` verbatim (the prototypes link it) and adds
 * exactly one value: `--caution-700:#8A5F00`, the ressalva signal the palette
 * is missing, measured at 5.26:1 on white. No second palette.
 */
const BASE_CSS = `/* Base compartilhada dos dois protótipos de #494.
 * Herda /styles-tokens.css sem alterar nenhum valor. Adiciona um único token:
 * --caution-700, o sinal de ressalva que falta na paleta (5.26:1 sobre branco).
 * Cor nunca é o único portador: todo papel semântico aqui também carrega
 * palavra literal, glifo e posição.
 */
:root{
  --caution-700:#8A5F00;
  --baseline:1.65rem;
  --rail:13.5rem;
  --numero:8.5rem;
}
*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;
  background:var(--white);
  color:var(--text);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  font-size:var(--text-body-mobile);
  line-height:var(--lh-body);
}
@media (min-width:768px){body{font-size:var(--text-body-desktop)}}
main{max-width:var(--page-max);margin:0 auto;padding:0 var(--space-5) var(--space-8)}
.skip-link{position:absolute;left:-9999px}
.skip-link:focus{left:var(--space-4);top:var(--space-4);background:var(--white);padding:var(--space-3);z-index:2}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.proto-banner{
  margin:0;padding:var(--space-3) var(--space-5);
  background:var(--navy-950);color:var(--white);
  font-size:var(--text-micro);line-height:var(--lh-micro);
}
h1{font-size:var(--text-h1);line-height:1.06;letter-spacing:-.01em;color:var(--ink);margin:0 0 var(--space-4)}
h2{font-size:var(--text-h2);line-height:1.12;color:var(--ink);margin:var(--space-8) 0 var(--space-4)}
h3{font-size:1.15rem;color:var(--ink);margin:var(--space-5) 0 var(--space-2)}
.eyebrow{font-size:var(--text-micro);line-height:var(--lh-micro);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 var(--space-3)}
.page-head{padding:var(--space-8) 0 var(--space-5)}
.lead{font-family:var(--serif);font-size:1.2rem;max-width:var(--read-measure);margin:0}
.autoria{font-size:var(--text-micro);line-height:var(--lh-micro);color:var(--muted);margin:var(--space-4) 0 0}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1}

/* --- conversão: subárvore idêntica nas duas variantes ------------- */
.conversion{margin:var(--space-6) 0;padding:var(--space-6) 0;border-block:1px solid var(--line)}
.oferta__unidade{font-size:var(--text-micro);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 var(--space-2)}
.oferta__titulo{font-size:1.6rem;margin:0 0 var(--space-2)}
.oferta__resumo{margin:0 0 var(--space-5);max-width:var(--read-measure)}
.oferta__lockup{display:flex;flex-wrap:wrap;gap:var(--space-6);margin:0 0 var(--space-5)}
.oferta__lockup dt{font-size:var(--text-micro);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.oferta__lockup dd{margin:var(--space-1) 0 0;font-size:1.5rem;color:var(--ink)}
.conversion__actions{display:flex;flex-wrap:wrap;gap:var(--space-4);margin:0}
.button{display:inline-flex;align-items:center;justify-content:center;min-height:var(--touch-min);padding:0 var(--space-5);border-radius:var(--radius-sm);text-decoration:none;font-weight:600;border:1px solid transparent}
.button-primary{background:var(--green-700);color:var(--white)}
.button-primary:hover{background:var(--navy-900)}
.button-ghost{border-color:var(--line);color:var(--ink)}
.button-ghost:hover{border-color:var(--ink)}
/* O anel de foco não é desta issue. #513 já corrigiu --focus-ring para
 * 0 0 0 2px var(--white),0 0 0 5px var(--ink), medido entre 13,48:1 e 19,11:1
 * em nove superfícies. Os protótipos herdam o token corrigido e nenhuma
 * candidata pode regredi-lo; o outline transparente preserva o anel em
 * forced-colors, onde box-shadow não é pintado. */
.button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,button:focus-visible{box-shadow:var(--focus-ring);outline:2px solid transparent;outline-offset:2px}

/* --- formulário --------------------------------------------------- */
.captura{margin:var(--space-8) 0 0;padding:var(--space-6) 0;border-top:1px solid var(--line)}
.form{max-width:34rem;margin-top:var(--space-5)}
.field{margin-bottom:var(--space-5)}
.field label{display:block;font-weight:600;color:var(--ink)}
.field__help{margin:var(--space-1) 0 var(--space-2);font-size:var(--text-small);color:var(--muted)}
.field input,.field textarea{width:100%;min-height:var(--touch-min);padding:var(--space-3);border:1px solid var(--muted);border-radius:var(--radius-sm);font:inherit;color:var(--ink);background:var(--white)}
.field[data-state="error"] input,.field[data-state="error"] textarea{border-width:2px;border-color:var(--caution-700)}
.field__error{margin:var(--space-2) 0 0;font-size:var(--text-small);color:var(--caution-700);font-weight:600}
.field__error::before{content:"Erro — ";}
.field__turnstile{margin:var(--space-5) 0;padding:var(--space-3);border:1px dashed var(--line);font-size:var(--text-small);color:var(--muted)}
.form__actions{margin:var(--space-5) 0 0}
.form__success{margin:var(--space-4) 0 0;font-size:var(--text-small);color:var(--green-700);font-weight:600}
.form__success::before{content:"✓ ";}
.estado-vazio{margin:var(--space-4) 0 0;padding:var(--space-4);background:var(--soft);font-size:var(--text-small)}

/* --- afirmações: casca comum -------------------------------------- */
.claims{margin-top:var(--space-6)}
.claim{padding:var(--space-5) 0;border-top:1px solid var(--line)}
.claim__natureza{margin:0 0 var(--space-2);font-size:var(--text-micro);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.claim__text{margin:0;max-width:var(--read-measure)}
.claim__evidencia,.claim__fonte{margin:var(--space-3) 0 0;font-size:var(--text-small);color:var(--muted);max-width:var(--read-measure)}
.claim__evidencia-rotulo{font-weight:700;color:var(--ink)}
.claim__numero{margin:0;font-size:1.75rem;line-height:var(--baseline);color:var(--ink)}
.claim__numero--vazio{color:var(--muted)}

/* --- tabela de dado ----------------------------------------------- */
.tabela-dado{width:100%;border-collapse:collapse;margin-top:var(--space-4)}
.tabela-dado caption{text-align:start;font-size:var(--text-small);color:var(--muted);padding-bottom:var(--space-3)}
.tabela-dado th,.tabela-dado td{padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--line);text-align:start;vertical-align:baseline}
.tabela-dado thead th{font-size:var(--text-micro);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink)}
.tabela-dado .num{text-align:end;font-variant-numeric:tabular-nums lining-nums}
.tabela-dado tfoot th,.tabela-dado tfoot td{border-top:2px solid var(--ink);font-weight:700}

/* --- specimen ------------------------------------------------------ */
.spec-block{padding-top:var(--space-5);border-top:1px solid var(--line)}
.metadado{margin:0;padding-inline-start:var(--space-4);border-inline-start:2px solid var(--ink);font-size:var(--text-micro);line-height:var(--lh-micro)}
.metadado .trilho__row{display:grid;grid-template-columns:6.5rem minmax(0,1fr);gap:var(--space-2);padding-block:var(--space-1)}
.metadado dt{color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.metadado dd{margin:0;color:var(--ink)}
.measure{max-width:var(--read-measure);font-family:var(--serif)}
.glifos{font-family:var(--mono);font-size:1.4rem}
.numero-dominante{margin:0;font-size:clamp(2.4rem,5vw,3.6rem);line-height:1.05;color:var(--ink)}
.numero-dominante__portador{margin:var(--space-2) 0 0;font-size:var(--text-small);color:var(--muted)}
.cinza{filter:grayscale(1);padding:var(--space-4);border:1px solid var(--line)}

.page-foot{max-width:var(--page-max);margin:0 auto;padding:var(--space-6) var(--space-5) var(--space-8);border-top:1px solid var(--line);font-size:var(--text-small);color:var(--muted)}

/* --- 400% zoom e refluxo: nada rola na horizontal ------------------ */
html,body{overflow-x:hidden}
.tabela-dado{display:block;overflow-x:auto}

/* --- impressão ----------------------------------------------------- */
@media print{
  .proto-banner,.conversion__actions,.form,.skip-link{display:none}
  body{background:#fff;color:#000;font-size:11pt}
  .claim{break-inside:avoid;border-top:1pt solid #000}
  .estado__texto,.trilho__row dd{color:#000}
  a[href^="http"]::after{content:" (" attr(href) ")";font-size:9pt}
}

/* --- movimento ------------------------------------------------------ */
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/**
 * Mechanism A. The numeric column is the layout engine: every claim is a grid
 * whose first track is the number and whose last track is the rail, and the
 * prose is what adapts to them. Below 900px the rail becomes a note anchored
 * to the same id, never a page footnote.
 */
const MECHANISM_A_CSS = `/* Mecanismo A — trilho de memória. Um único movimento memorável. */
.claim{
  display:grid;
  grid-template-columns:1fr;
  gap:var(--space-4);
}
@media (min-width:900px){
  .claim{
    grid-template-columns:var(--numero) minmax(0,1fr) var(--rail);
    column-gap:var(--space-6);
    align-items:start;
  }
  .claim__numero{text-align:end;grid-column:1}
  .claim__prosa{grid-column:2}
  .trilho{grid-column:3}
}
.claim__numero{padding-top:0}
.trilho{
  margin:0;
  padding-inline-start:var(--space-4);
  border-inline-start:2px solid var(--ink);
  font-size:var(--text-micro);
  line-height:var(--lh-micro);
}
.trilho__row{display:grid;grid-template-columns:6.5rem minmax(0,1fr);gap:var(--space-2);padding-block:var(--space-1)}
.trilho__row dt{color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.trilho__row dd{margin:0;color:var(--ink)}
.trilho__row--lacuna dd{color:var(--caution-700);font-weight:700}
.trilho__row--lacuna dd::before{content:"× ";}
.claim[data-incompleta="sim"] .claim__prosa{
  border-inline-start:3px solid var(--caution-700);
  padding-inline-start:var(--space-4);
}
.claim__incompleta{
  margin:var(--space-3) 0 0;
  font-size:var(--text-small);
  font-weight:700;
  color:var(--caution-700);
}
.claim__incompleta::before{content:"× ";}
.claim[data-incompleta="sim"] .trilho{border-inline-start-color:var(--caution-700)}
`;

/**
 * Mechanism B. The revision state governs rendering. Expired claims are
 * degraded and marked; a claim with no data de corte is born marked. The
 * marker is a status line and a start-edge keyline — never a drawn carimbo,
 * which is the central signifier of the CAD caricature and is forbidden.
 */
const MECHANISM_B_CSS = `/* Mecanismo B — estado de revisão. Um único movimento memorável.
 * Proibido por projeto: caixa de quatro lados, texto rotacionado, bloco de
 * canto e grade de células de legenda de prancha. O estado é linha de status
 * e fio de borda inicial, e diz o estado em palavra antes de dizer em cor.
 */
.estado,.estado-pagina{
  display:flex;gap:var(--space-3);align-items:baseline;
  margin:0 0 var(--space-4);
  padding:var(--space-3) 0 var(--space-3) var(--space-4);
  border-inline-start:4px solid var(--line);
  font-size:var(--text-small);
  line-height:var(--lh-micro);
}
.estado-pagina{margin:var(--space-5) 0 0;font-size:var(--text-body-mobile)}
.estado__glifo{font-family:var(--mono);font-weight:700;min-width:1ch}
.estado--valida{border-inline-start-color:var(--green-700);color:var(--muted)}
.estado--vencida{border-inline-start-color:var(--caution-700);color:var(--caution-700);font-weight:700}
.estado--sem-data{border-inline-start-color:var(--ink);color:var(--ink);font-weight:700}
.estado--degradada{border-inline-start-color:var(--caution-700);color:var(--caution-700);font-weight:700}

/* Renderização degradada: o valor deixa de ter peso de afirmação corrente e
 * passa a ser apresentado como valor fora da validade, em palavra. */
.claim[data-revision-state="vencida"] .claim__numero,
.claim[data-revision-state="sem-data"] .claim__numero{
  color:var(--muted);
  font-weight:400;
}
.claim[data-revision-state="vencida"] .claim__numero::after{
  content:" fora da validade";
  font-family:system-ui,sans-serif;
  font-size:var(--text-micro);
  text-transform:uppercase;
  letter-spacing:.06em;
}
.claim[data-revision-state="sem-data"] .claim__numero::after{
  content:" sem data de corte";
  font-family:system-ui,sans-serif;
  font-size:var(--text-micro);
  text-transform:uppercase;
  letter-spacing:.06em;
}
.claim[data-revision-state="vencida"],
.claim[data-revision-state="sem-data"]{
  padding-inline-start:var(--space-4);
  border-inline-start:1px solid var(--line);
}
.claim__fonte--ausente{color:var(--caution-700);font-weight:700}
.claim__fonte--ausente::before{content:"× ";}
`;

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function loadContent(path = CONTENT_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function build({ outDir = PROTOTYPE_DIR, content = loadContent() } = {}) {
  const meta = { today: content.today, validadeDias: content.validade_dias };
  const written = [];
  const write = (rel, text) => {
    const target = join(outDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
    written.push(rel);
  };

  write("base.css", BASE_CSS);
  for (const [key, variant] of Object.entries(VARIANTS)) {
    rmSync(join(outDir, variant.slug), { recursive: true, force: true });
    write(`${variant.slug}/mechanism.css`, key === "a" ? MECHANISM_A_CSS : MECHANISM_B_CSS);
    for (const job of content.jobs) {
      write(`${variant.slug}/${job.id}/index.html`, renderPage({ job, variantKey: key, meta }));
      write(`${variant.slug}/g1-nulos/${job.id}/index.html`, renderNulled({ job, variantKey: key, meta }));
    }
    const money = content.jobs.find((j) => j.oferta) || content.jobs[0];
    write(`${variant.slug}/specimen/index.html`, specimen({ spec: content.specimen, job: money, variantKey: key, meta }));
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = build();
  for (const rel of written) console.log("wrote docs/design-audit/prototypes/" + rel);
  console.log(`PROTOTYPES_OK files=${written.length}`);
}
