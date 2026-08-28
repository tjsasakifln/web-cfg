/**
 * Preview/noindex offer surfaces. Flag-off for public catalog.
 */
const fs = require("fs");
const path = require("path");
const { publicCatalog } = require("./public.cjs");
const { currentTerms } = require("./terms.cjs");
const { getOffer, PUBLIC_OFFER_IDS } = require("./registry.cjs");
const { loadFlags } = require("./flags.cjs");

const ROOT = path.join(__dirname, "../..");
const SITE = "https://confenge.com.br";

function brl(cents) {
  if (cents == null) return "sob consulta";
  return `R$ ${(cents / 100).toLocaleString("pt-BR")}`;
}

function priceLine(offer) {
  if (offer.billing_mode === "one_time") return `${brl(offer.amount_cents)} (pagamento unico)`;
  if (offer.max_payments) {
    return `${offer.max_payments} x ${brl(offer.amount_cents)} (total ${brl(offer.total_commitment_cents)})`;
  }
  return `${brl(offer.amount_cents)} / mes, sem minimo, aviso de ${offer.notice_days} dias`;
}

function page({ title, canonical, h1, lead, body }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} | CONFENGE</title>
<meta name="robots" content="noindex,nofollow"/>
<meta name="description" content="${lead}"/>
<link rel="canonical" href="${canonical}"/>
<link rel="stylesheet" href="/styles.css"/>
<link rel="stylesheet" href="/styles-tools.css"/>
</head>
<body data-offer-preview="1">
<a class="skip-link" href="#conteudo">Pular para o conteudo</a>
<header class="site-header">
<div class="container header-inner">
<a class="brand" href="/" aria-label="CONFENGE, pagina inicial"><img alt="CONFENGE Inteligencia Tecnica" src="/assets/logo-confenge-500-f8a83f6d.png" width="224" height="58"/></a>
</div>
</header>
<main id="conteudo" class="container" style="max-width:46rem;padding:1.5rem 1rem 4rem;">
<nav aria-label="Navegacao estrutural" class="breadcrumbs"><ol>
<li><a href="/">Inicio</a><span aria-hidden="true">/</span></li>
<li><a href="/piloto/ofertas/">Ofertas (preview)</a><span aria-hidden="true">/</span></li>
<li aria-current="page">${h1}</li>
</ol></nav>
<p class="eyebrow">Preview interno · catalogo publico desligado</p>
<h1>${h1}</h1>
<p class="content-lead">${lead}</p>
${body}
</main>
<footer class="site-footer"><div class="container footer-bottom"><span>© 2026 CONFENGE.</span><a href="/privacidade/">Politica de Privacidade</a></div></footer>
</body>
</html>
`;
}

function writePages() {
  const flags = loadFlags();
  const catalog = publicCatalog();
  const terms = currentTerms();
  const dir = path.join(ROOT, "piloto/ofertas");
  fs.mkdirSync(dir, { recursive: true });

  const rows = catalog.offers.map((offer) => {
    const href = `/piloto/ofertas/${slugFor(offer.offer_id)}/`;
    return `<tr>
<td><a href="${href}">${offer.public_name}</a></td>
<td>${priceLine(offer)}</td>
<td>${offer.checkout_mode}</td>
<td><a class="button" href="/piloto/ofertas/contratar/" data-plano="${offer.offer_id}">Verificar capacidade</a></td>
</tr>`;
  }).join("");

  const compare = page({
    title: "Comparar ofertas CONFENGE",
    canonical: `${SITE}/piloto/ofertas/`,
    h1: "Comparar ofertas",
    lead: "Precos visiveis, sem link generico de pagamento. Preview noindex enquanto o catalogo publico permanece desligado.",
    body: `
<p>Flags: catalogo publico=${flags.CONFENGE_OFFER_CATALOG_PUBLIC} · ASAAS_MODE=${flags.ASAAS_MODE} · pagamento de producao=${flags.production_checkout_enabled}.</p>
<table class="ma-table">
<caption>Ofertas publicas aprovadas (sem Extra historico)</caption>
<thead><tr><th scope="col">Oferta</th><th scope="col">Preco</th><th scope="col">Modo</th><th scope="col">Proximo passo</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="ma-cta">
<a class="button button-primary" href="/piloto/ofertas/contratar/">Solicitar contratacao</a>
<a class="button" href="/piloto/ofertas/faq/">Perguntas frequentes</a>
</p>
<p>Termos em preview: <code>${terms.terms_version}</code>. Nao ha validacao juridica neste snapshot.</p>`,
  });
  fs.writeFileSync(path.join(dir, "index.html"), compare);

  const details = {
    "CFG-DIAG-EXP-v1": {
      slug: "diagnostico-expansao",
      scope: "Mapa de compradores, 15 concorrentes, painel de precos, contratos a vencer, avisos triados, recomendacoes, PDF executivo, planilhas, reuniao inicial e apresentacao final. Credito nao cumulativo de R$ 2.000 no primeiro mes do Plano Mensal, Compromisso Semestral ou Compromisso Anual se contratado em 60 dias.",
      exclusions: "Nao inclui execucao de obra, garantia financeira, orcamento completo do zero nem quadro dedicado.",
      prazo: "10 a 15 dias uteis apos alinhamento e dados.",
    },
    "CFG-DIRB2G-FLEX-v1": {
      slug: "diretoria-flex",
      scope: "Defesa de um contrato/obra ativo + Operacao de Proposta para Licitacao Critica com ate 4 oportunidades aceitas em andamento. Reuniao inicial <=90 min, uma reuniao executiva mensal <=90 min, ate duas taticas de 30 min, canal assincrono.",
      exclusions: "Quinto item simultaneo, segundo contrato, urgencia abaixo de 5 dias uteis, juridico de foro, ART/RRT, vistoria fisica e equipe full-time exigem aditivo.",
      prazo: "Sem minimo. Aviso de 30 dias.",
    },
    "CFG-DIRB2G-180-v1": {
      slug: "diretoria-180",
      scope: "Mesmo escopo do Plano Mensal, com compromisso de 6 meses.",
      exclusions: "Mesmas exclusoes do Plano Mensal. Saida antecipada so com formula aprovada.",
      prazo: "6 meses. Aviso de 30 dias.",
    },
    "CFG-DIRB2G-365-v1": {
      slug: "diretoria-365",
      scope: "Mesmo escopo do Plano Mensal, com compromisso de 12 meses.",
      exclusions: "Mesmas exclusoes do Plano Mensal. Sem renovacao silenciosa ao fim do compromisso.",
      prazo: "12 meses. Aviso de 30 dias.",
    },
  };

  for (const id of PUBLIC_OFFER_IDS) {
    const offer = getOffer(id);
    const meta = details[id];
    const dest = path.join(dir, meta.slug);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(
      path.join(dest, "index.html"),
      page({
        title: offer.public_name,
        canonical: `${SITE}/piloto/ofertas/${meta.slug}/`,
        h1: offer.public_name,
        lead: priceLine(offer),
        body: `
<h2>Escopo</h2><p>${meta.scope}</p>
<h2>Exclusoes</h2><p>${meta.exclusions}</p>
<h2>Prazo e compromisso</h2><p>${meta.prazo}</p>
<p class="ma-cta">
<a class="button button-primary" href="/piloto/ofertas/contratar/" data-plano="${offer.offer_id}">Verificar capacidade</a>
<a class="button" href="/piloto/ofertas/">Voltar a comparacao</a>
</p>
<p>Nao ha link generico de pagamento. O pagamento so existe depois de capacidade APPROVED e aceite de termos.</p>`,
      }),
    );
  }

  fs.mkdirSync(path.join(dir, "faq"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "faq/index.html"),
    page({
      title: "FAQ das ofertas",
      canonical: `${SITE}/piloto/ofertas/faq/`,
      h1: "Perguntas frequentes",
      lead: "Ate 4 oportunidades em andamento, uma obra/contrato, capacidade, aviso, Diagnostico e credito.",
      body: `
<dl>
<dt>O que e o limite de 4 oportunidades?</dt>
<dd>Ate quatro oportunidades ativas aceitas ao mesmo tempo. Nao e cota mensal.</dd>
<dt>Uma obra ou contrato?</dt>
<dd>O padrao cobre um contrato/obra ativo. Um segundo contrato exige capacidade e aditivo.</dd>
<dt>Como funciona a capacidade?</dt>
<dd>Teto de 50 vagas Full, uma vaga padrao, reserva provisoria de 72 horas, reserva final so apos pagamento confirmado.</dd>
<dt>Aviso e cancelamento</dt>
<dd>Plano Mensal: aviso de 30 dias. Compromisso Semestral e Compromisso Anual: compromisso minimo; saida antecipada depende de texto juridico ainda nao validado.</dd>
<dt>Diagnostico e credito</dt>
<dd>Diagnostico e avulso. Ha credito de R$ 2.000 no primeiro mes do Plano Mensal, Compromisso Semestral ou Compromisso Anual se contratado em 60 dias da entrega. Nao e cumulativo.</dd>
</dl>
<p><a class="button button-primary" href="/piloto/ofertas/contratar/">Solicitar contratacao</a></p>`,
    }),
  );

  fs.mkdirSync(path.join(dir, "contratar"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "contratar/index.html"),
    page({
      title: "Solicitar contratacao",
      canonical: `${SITE}/piloto/ofertas/contratar/`,
      h1: "Solicitar contratacao",
      lead: "Capacidade e termos antes de qualquer pagamento. Preview sem dinheiro real.",
      body: `
<form class="tool-form" method="post" action="/.netlify/functions/offer-eligibility" data-no-url-cnpj="true">
<input type="hidden" name="action" value="eligibility"/>
<div class="tool-field">
<label for="cnpj">CNPJ</label>
<input id="cnpj" name="cnpj" inputmode="numeric" autocomplete="off" maxlength="18"/>
</div>
<div class="tool-field">
<label for="representante">Representante</label>
<input id="representante" name="representante" autocomplete="name"/>
</div>
<div class="tool-field">
<label for="plano">Plano</label>
<select id="plano" name="offer_id">
${PUBLIC_OFFER_IDS.map((id) => `<option value="${id}">${getOffer(id).public_name}</option>`).join("")}
</select>
</div>
<div class="tool-field">
<label for="contrato">Contrato-alvo</label>
<input id="contrato" name="target_contract"/>
</div>
<div class="tool-field">
<label for="inicio">Data de inicio</label>
<input id="inicio" name="start_date" type="date"/>
</div>
<div class="tool-field">
<label><input type="checkbox" name="accept_terms" value="1"/> Li o snapshot ${terms.terms_version} (preview, sem validacao juridica).</label>
</div>
<div class="tool-actions">
<button class="button button-primary" type="submit">Verificar capacidade</button>
</div>
</form>
<p>O CNPJ nao entra na URL nem em analytics. Nao ha cobranca nesta pagina.</p>`,
    }),
  );
}

function slugFor(offerId) {
  return {
    "CFG-DIAG-EXP-v1": "diagnostico-expansao",
    "CFG-DIRB2G-FLEX-v1": "diretoria-flex",
    "CFG-DIRB2G-180-v1": "diretoria-180",
    "CFG-DIRB2G-365-v1": "diretoria-365",
  }[offerId];
}

if (require.main === module) {
  writePages();
  process.stdout.write("wrote piloto/ofertas preview pages\n");
}

module.exports = { writePages, priceLine, brl };
