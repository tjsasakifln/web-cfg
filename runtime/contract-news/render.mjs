import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assetId, PAGE_SIZE, PREFIX } from './schema.mjs';

export const ORIGIN = 'https://confenge.com.br';
const BRAND_IMAGE = '/assets/og-confenge.jpg';
const HEADER_LOGO = '/assets/logo-confenge-500-f8a83f6d.png';
const FOOTER_LOGO = '/assets/logo-confenge-white-500-1677038e.png';
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' });
const TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const IA = JSON.parse(readFileSync(new URL('../../data/site/public-ia-map.json', import.meta.url), 'utf8'));
const BRAND = JSON.parse(readFileSync(new URL('../../data/site/brand.json', import.meta.url), 'utf8'));
const CATEGORY_LABELS = Object.freeze({ obras: 'Obras', saneamento: 'Saneamento', infraestrutura: 'Infraestrutura', projetos: 'Projetos de engenharia', manutencao: 'Manutenção de engenharia' });
const categoryLabel = category => CATEGORY_LABELS[category] || 'Contratos públicos';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const e = escapeHtml;
const localDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? DATE.format(new Date(value + 'T12:00:00Z')) : DATE.format(new Date(value));
const publicationDate = value => TIME.format(new Date(value));
export const articlePath = article => PREFIX + article.slug + '/';
export const pagePath = page => page === 1 ? PREFIX : PREFIX + 'pagina/' + page + '/';
export const sortedArticles = articles => [...articles].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.slug.localeCompare(b.slug));
const serialized = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function money(value) {
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)) + ((fraction[2] || '0') >= '5' ? 1n : 0n);
  return 'R$ ' + String(cents / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + String(cents % 100n).padStart(2, '0');
}
const navAnalytics = (position, identifier) => `data-cta-position="${e(position)}" data-cta-id="nav-${e(position)}-${e(identifier)}" data-event-name="cta_click" data-navigation-link="true"`;
function navigation(kind) {
  const position = kind === 'desktop' ? 'header_nav' : 'mobile_nav';
  const parts = IA.header.destinations.map(group => {
    const id = 'nav-' + kind + '-' + group.id;
    const attributes = suffix => navAnalytics(position, group.id + '-' + suffix);
    return `<details class="nav-group${group.href === '/conteudos/' ? ' is-active' : ''}" name="nav-${kind}" data-nav-group="${e(group.id)}"><summary class="nav-group__toggle" aria-controls="${e(id)}">${e(group.label)}</summary><div class="nav-panel" id="${e(id)}">${group.children.map(item => `<a class="nav-destination" href="${e(item.href)}" data-nav-destination="${e(item.id)}" ${attributes(item.id)}>${e(item.label)}<span class="nav-destination__description">${e(item.description)}</span></a>`).join('')}<a class="nav-overview" data-nav-primary="true" data-nav-label="${e(group.label)}"${group.href === '/conteudos/' ? ' aria-current="page"' : ''} href="${e(group.href)}" ${attributes('overview')}>${e(group.overview_label)}</a></div></details>`;
  });
  if (kind === 'mobile') parts.push(`<div class="mobile-nav__utility">${IA.header.utility_links.map(item => `<a href="${e(item.href)}" ${navAnalytics(position, item.id)}>${e(item.label)}</a>`).join('')}</div>`);
  return parts.join('\n');
}
function discoveryBar() {
  const shortcuts = IA.header.quick_links.map(item => `<a href="${e(item.href)}" ${navAnalytics('header_shortcut', item.id)}>${e(item.label)}</a>`).join('');
  const portals = IA.header.portal_links.map(item => `<a class="nav-discovery__portal" href="${e(item.href)}" ${navAnalytics('header_portal', item.id)}>${e(item.label)}</a>`).join('');
  const utility = IA.header.utility_links.map(item => `<a class="nav-discovery__company" href="${e(item.href)}" ${navAnalytics('header_utility', item.id)}>${e(item.label)}</a>`).join('');
  return `<!-- BEGIN NAV DISCOVERY --><nav class="nav-discovery-region" aria-label="Acesso direto"><div class="nav-discovery" data-nav-discovery="true"><div class="container nav-discovery__inner"><div class="nav-discovery__shortcuts"><span class="nav-discovery__label">Acesso direto</span>${shortcuts}</div><div class="nav-discovery__portals">${portals}</div>${utility}</div></div></nav><!-- END NAV DISCOVERY -->`;
}
function header() {
  return `<header class="site-header news-site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="CONFENGE, página inicial"><img src="${HEADER_LOGO}" width="224" height="58" alt="CONFENGE Inteligência Técnica"></a><nav class="desktop-nav" aria-label="Navegação principal">\n${navigation('desktop')}\n</nav><a class="button button-primary header-cta" href="${e(IA.header.cta.href)}">${e(IA.header.cta.label)}</a><details class="news-mobile-menu"><summary>Menu</summary><nav class="news-mobile-nav" aria-label="Navegação móvel">\n${navigation('mobile')}\n<a class="button button-primary" href="${e(IA.header.cta.href)}">${e(IA.header.cta.label)}</a>\n</nav></details></div>\n</header>\n${discoveryBar()}`;
}
function footer() {
  return `<footer class="site-footer"><div class="container footer-top"><div class="footer-brand"><img src="${FOOTER_LOGO}" width="224" height="58" loading="lazy" decoding="async" alt="CONFENGE"><p>${e(BRAND.positioning.footer_blurb)}</p></div>\n${IA.footer.columns.map(column => `<div class="footer-links"><strong>${e(column.heading)}</strong>${column.links.map(link => `<a href="${e(link.href)}">${e(link.label)}</a>`).join('')}${column.contact ? `<a href="mailto:${e(BRAND.contact.email)}">${e(BRAND.contact.email)}</a><a href="tel:${e(BRAND.contact.phone_e164.replace(/-/g, ''))}">${e(BRAND.contact.phone_display)}</a><span>Atendimento em todo o Brasil.</span>` : ''}</div>`).join('')}</div><div class="container footer-bottom"><p>© <span id="year">2026</span> CONFENGE. CNPJ ${e(BRAND.contact.cnpj)}.</p><nav class="footer-authority" aria-label="Políticas e contato"><a href="/politica-editorial/">Política editorial</a><a href="/triagem-tecnica/#corrigir-o-site">Encontrou um erro?</a><a href="/conflitos/">Conflitos</a><a href="/privacidade/">Privacidade</a><a href="/termos-de-uso/">Termos de uso</a></nav></div></footer>`;
}
function breadcrumb(path, title, article = false) {
  const trail = [];
  const seen = new Set();
  for (let cursor = path; cursor && !seen.has(cursor);) {
    seen.add(cursor);
    const name = cursor === '/' ? 'Início' : cursor === path && path !== PREFIX ? (article ? 'Contrato publicado' : title) : IA.breadcrumb_labels[cursor];
    if (!name) throw new Error('contract_news_breadcrumb_label_missing');
    trail.unshift({ name, path: cursor });
    const rule = IA.parents.find(rule => rule.exact && rule.prefix === cursor)
      || IA.parents.filter(rule => !rule.exact && cursor.startsWith(rule.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    cursor = rule ? rule.parent : '/';
  }
  const entries = trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: ORIGIN + item.path }));
  const items = trail.map((item, index) => index === trail.length - 1 ? `<li aria-current="page">${e(item.name)}</li>` : `<li><a href="${e(item.path)}">${e(item.name)}</a><span aria-hidden="true">/</span></li>`).join('');
  return { data: { '@type': 'BreadcrumbList', itemListElement: entries }, html: `<nav class="breadcrumbs news-breadcrumbs" aria-label="Navegação estrutural"><ol>${items}</ol></nav>` };
}
function shell({ title, description, path, main, graph = [], article, noindex = false }) {
  const crumb = breadcrumb(path, article ? article.title : title, Boolean(article));
  const organization = { '@type': 'Organization', '@id': ORIGIN + '/#organization', name: 'CONFENGE', url: ORIGIN + '/', logo: ORIGIN + '/assets/logo-confenge.png' };
  const jsonld = serialized({ '@context': 'https://schema.org', '@graph': [organization, crumb.data, ...graph] });
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)} | CONFENGE</title><meta name="description" content="${e(description)}"><meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}"><meta name="author" content="CONFENGE"><meta name="theme-color" content="#061a33"><link rel="canonical" href="${ORIGIN + e(path)}"><link rel="icon" href="/favicon.ico"><link rel="preload" as="font" type="font/woff2" href="/assets/archivo-var-latin-b19be0f7.woff2" crossorigin="anonymous"/><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assets/editorial.css"><link rel="stylesheet" href="/assets/css/contract-news.css"><link rel="alternate" type="application/rss+xml" title="Notícias de contratos públicos CONFENGE" href="${PREFIX}feed.xml"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="CONFENGE"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${ORIGIN + e(path)}"><meta property="og:image" content="${ORIGIN + BRAND_IMAGE}"><meta property="og:image:alt" content="CONFENGE Engenharia e Inteligência Técnica"><meta name="twitter:card" content="summary_large_image">${article ? `<meta property="article:published_time" content="${e(article.published_at)}"><meta property="article:modified_time" content="${e(article.modified_at)}">` : ''}<script type="application/ld+json">${jsonld}</script><script defer src="/script.js"></script><script defer src="/assets/js/contract-news.js"></script></head><body class="news-page" data-content-cluster="noticias-contratos-publicos" data-route-family="noticias-contratos-publicos" data-asset-family="editorial" data-asset-id="${article ? assetId(article) : 'contract-news-hub'}"><a class="skip-link" href="#conteudo">Pular para o conteúdo</a>${header()}<main id="conteudo" class="news-main"><div class="container">${crumb.html}${main}</div></main>${footer()}</body></html>`;
  const navAssets = '<link rel="stylesheet" href="/assets/portal/public-nav.css"><script defer src="/assets/portal/public-nav.js"></script>';
  return { html: html.replace("</head>", navAssets + "</head>"), jsonld };
}
export function contentPolicy(jsonld = '') {
  const hash = jsonld ? " 'sha256-" + createHash('sha256').update(jsonld).digest('base64') + "'" : '';
  return "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: https://www.google-analytics.com https://region1.google-analytics.com; font-src 'self'; style-src 'self'; script-src 'self' https://www.googletagmanager.com" + hash + "; script-src-attr 'none'; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; upgrade-insecure-requests";
}
function commercial(article) {
  const id = article ? assetId(article) : 'contract-news-hub';
  const attributes = `data-asset-id="${id}" data-asset-family="editorial" data-route-family="noticias-contratos-publicos" data-cta-position="article_end"`;
  const whatsapp = 'https://wa.me/5548988344559?text=' + encodeURIComponent('Olá, gostaria de conversar sobre apoio de engenharia para contratos públicos.');
  return `<aside class="news-commercial" aria-labelledby="news-commercial-title"><p class="eyebrow">Engenharia para contratos públicos</p><h2 id="news-commercial-title">Do contrato à documentação da obra</h2><p>A CONFENGE apoia empresas em projetos, compatibilização, orçamentos, medições e documentação técnica. Conheça o trabalho adequado à necessidade da sua obra.</p><a class="button button-primary" href="/acompanhamento-contratos-obras/" data-cta-id="news-contract-support" data-news-service-link="true" ${attributes}>Conhecer o apoio a contratos públicos</a><p class="news-commercial-secondary"><a href="${e(whatsapp)}" data-cta-id="news-contact-whatsapp" data-event-name="whatsapp_click" ${attributes} target="_blank" rel="noopener">Conversar sobre meu contrato pelo WhatsApp</a></p><p class="news-commercial-secondary"><a href="/ferramentas/radar-mercado-publico/" data-cta-id="news-open-radar" data-event-name="cta_click" ${attributes}>Pesquisar outros contratos no Radar Público</a></p></aside>`;
}
function card(article) {
  return `<article class="news-card"><p class="news-category">${e(categoryLabel(article.category))}</p><h2><a href="${articlePath(article)}">${e(article.title)}</a></h2><p>${e(article.description)}</p><div class="news-card-meta"><span>${article.editorial ? 'Notícia com análise técnica' : e(money(article.facts.value.amount))}</span><time datetime="${e(article.published_at)}">${e(localDate(article.published_at))}</time></div></article>`;
}
export function renderIndex(snapshot, page = 1) {
  const articles = sortedArticles(snapshot.articles);
  const pages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  if (!Number.isSafeInteger(page) || page < 1 || page > pages) return null;
  const selected = articles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const path = pagePath(page);
  const title = 'Notícias de obras e contratos públicos' + (page > 1 ? ' | Página ' + page : '');
  const description = 'Notícias de obras e contratos públicos com apuração documental, contexto da contratação e análise técnica da CONFENGE.';
  const pagination = pages > 1 ? `<nav class="news-pagination" aria-label="Páginas de notícias">${page > 1 ? `<a rel="prev" href="${pagePath(page - 1)}">Página anterior</a>` : '<span></span>'}<span>Página ${page} de ${pages}</span>${page < pages ? `<a rel="next" href="${pagePath(page + 1)}">Próxima página</a>` : '<span></span>'}</nav>` : '';
  const main = `<header class="news-hero"><p class="eyebrow">Mercado público</p><h1>Notícias de obras e contratos públicos</h1><p class="news-deck">Entenda o que os contratos de obras e infraestrutura representam, com leitura dos documentos, contexto e análise técnica.</p><p class="news-editorial-links"><a href="/politica-editorial/#noticias-contratos-publicos">Como selecionamos as notícias</a><a href="${PREFIX}feed.xml">Acompanhar por RSS</a></p></header>${selected.length ? `<section class="news-grid" aria-label="Contratos publicados">${selected.map(card).join('')}</section>` : '<section class="news-empty"><h2>Novas publicações em preparação</h2><p>Os contratos selecionados serão apresentados aqui após a conferência dos dados.</p><a href="/ferramentas/radar-mercado-publico/">Consultar a base no Radar Público</a></section>'}${pagination}${commercial()}`;
  return shell({ title, description, path, main, noindex: !articles.length, graph: [{ '@type': 'CollectionPage', '@id': ORIGIN + path + '#webpage', url: ORIGIN + path, name: title, description, mainEntity: { '@type': 'ItemList', itemListElement: selected.map((article, index) => ({ '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + index + 1, url: ORIGIN + articlePath(article), name: article.title })) } }] });
}
export function renderArticle(article) {
  if (article.editorial) return renderReportedArticle(article);
  const facts = article.facts;
  const label = facts.value.kind === 'valorGlobal' ? 'Valor global registrado' : 'Valor inicial registrado';
  const optionalRow = (label, value) => value ? `<div><dt>${e(label)}</dt><dd>${e(localDate(value))}</dd></div>` : '';
  const location = [facts.administrative_location.city, facts.administrative_location.state].filter(Boolean).join(' / ');
  const main = `<article class="news-article"><header class="news-article-header"><p class="news-category">${e(categoryLabel(article.category))}</p><h1>${e(article.title)}</h1><p class="news-deck">${e(article.lead)}</p><div class="news-byline"><span>Por <a href="/empresa/">CONFENGE</a></span><span>Publicado em <time datetime="${e(article.published_at)}">${e(publicationDate(article.published_at))}</time></span>${article.modified_at !== article.published_at ? `<span>Atualizado em <time datetime="${e(article.modified_at)}">${e(publicationDate(article.modified_at))}</time></span>` : ''}</div></header><div class="news-article-layout"><div class="news-story">${article.paragraphs.map(paragraph => `<p>${e(paragraph)}</p>`).join('')}<section class="news-object" aria-labelledby="contract-object"><h2 id="contract-object">Objeto informado no contrato</h2><p>${e(facts.object)}</p></section><section class="news-source" aria-labelledby="contract-source"><h2 id="contract-source">Fonte e registro</h2><p>Informações do Portal Nacional de Contratações Públicas, consultadas em ${e(localDate(facts.source_checked_at))}.</p><p><a href="${e(facts.source_url)}" rel="noopener" target="_blank" data-event-name="pseo_source_open" data-source-kind="pncp">Consultar contrato no PNCP <span class="news-new-window">(abre em outra aba)</span></a></p><p class="news-record-id">Identificador PNCP: ${e(article.id)}</p><p><a href="/triagem-tecnica/#corrigir-o-site">Informar uma correção nesta notícia</a></p></section></div><aside class="news-contract" aria-labelledby="contract-facts"><h2 id="contract-facts">Dados do contrato</h2><dl><div class="news-value"><dt>${label}</dt><dd>${e(money(facts.value.amount))}</dd></div><div><dt>Órgão contratante</dt><dd>${e(facts.buyer)}</dd></div><div><dt>Fornecedor registrado</dt><dd>${e(facts.supplier)}</dd></div>${location ? `<div><dt>Localização da unidade do órgão</dt><dd>${e(location)}</dd></div>` : ''}<div><dt>Publicação no PNCP</dt><dd>${e(localDate(facts.source_published_at))}</dd></div>${optionalRow('Assinatura', facts.signed_at)}${optionalRow('Início da vigência', facts.starts_at)}${optionalRow('Fim da vigência', facts.ends_at)}</dl><p class="news-facts-note">Vigência é o período contratual registrado. A execução física e os pagamentos dependem dos respectivos documentos.</p></aside></div></article>${commercial(article)}<p class="news-back"><a href="${PREFIX}">Ver todas as notícias de contratos públicos</a></p>`;
  return shell({ title: article.title, description: article.description, path: articlePath(article), main, article, graph: [{ '@type': 'NewsArticle', '@id': ORIGIN + articlePath(article) + '#article', mainEntityOfPage: ORIGIN + articlePath(article), url: ORIGIN + articlePath(article), headline: article.title, description: article.description, datePublished: article.published_at, dateModified: article.modified_at, inLanguage: 'pt-BR', articleSection: categoryLabel(article.category), author: { '@type': 'Organization', '@id': ORIGIN + '/#organization', name: 'CONFENGE', url: ORIGIN + '/empresa/' }, publisher: { '@id': ORIGIN + '/#organization' }, citation: facts.source_url, articleBody: [article.lead, ...article.paragraphs].join('\n\n'), isAccessibleForFree: true }] });
}

function renderReportedArticle(article) {
  const facts = article.facts;
  const editorial = article.editorial;
  const sources = editorial.sources;
  const sourceNumber = id => sources.findIndex(source => source.id === id) + 1;
  const citations = ids => `<p class="news-citations">Fontes: ${ids.map(id => `<a href="#news-source-${e(id)}">[${sourceNumber(id)}]</a>`).join(' ')}</p>`;
  const summary = `<section class="news-summary" aria-labelledby="news-summary-title"><h2 id="news-summary-title">O que esta contratação revela</h2><ul>${editorial.summary.map(text => `<li>${e(text)}</li>`).join('')}</ul></section>`;
  const sections = editorial.sections.map((section, index) => `<section class="news-section${section.kind === 'technical' ? ' news-analysis' : ''}" aria-labelledby="news-section-${index}">${section.kind === 'technical' ? '<p class="news-analysis-label">Análise técnica da CONFENGE</p>' : ''}<h2 id="news-section-${index}">${e(section.heading)}</h2>${section.paragraphs.map(text => `<p>${e(text)}</p>`).join('')}${citations(section.source_ids)}</section>`).join('');
  const referenceList = `<section class="news-source" aria-labelledby="contract-source"><h2 id="contract-source">Fontes consultadas</h2><ol class="news-reference-list">${sources.map(source => `<li id="news-source-${e(source.id)}"><a href="${e(source.url)}" target="_blank" rel="noopener" data-event-name="pseo_source_open" data-source-kind="pncp">${e(source.title)} <span class="news-new-window">(abre em outra aba)</span></a><span>Consulta em ${e(localDate(source.checked_at))}.</span></li>`).join('')}</ol><p class="news-record-id">Identificador PNCP: ${e(article.id)}</p><p><a href="/triagem-tecnica/#corrigir-o-site">Informar uma correção nesta notícia</a></p></section>`;
  const rawObject = `<details class="news-original"><summary>Consultar o objeto original do cadastro</summary><p>Transcrição do registro no PNCP, preservada para conferência.</p><blockquote>${e(facts.object)}</blockquote></details>`;
  const optionalRow = (label, value) => value ? `<div><dt>${e(label)}</dt><dd>${e(localDate(value))}</dd></div>` : '';
  const location = [facts.administrative_location.city, facts.administrative_location.state].filter(Boolean).join(' / ');
  const ledger = `<aside class="news-contract" aria-labelledby="contract-facts"><h2 id="contract-facts">Registro consultado</h2><dl><div class="news-value"><dt>${facts.value.kind === 'valorGlobal' ? 'Valor global no cadastro PNCP' : 'Valor inicial no cadastro PNCP'}</dt><dd>${e(money(facts.value.amount))}</dd></div><div><dt>Órgão contratante</dt><dd>${e(editorial.display.buyer)}</dd></div><div><dt>Fornecedor registrado</dt><dd>${e(editorial.display.supplier)}</dd></div><div><dt>Objeto em síntese</dt><dd>${e(editorial.display.object)}</dd></div>${location ? `<div><dt>Localização da unidade administrativa</dt><dd>${e(location)}</dd></div>` : ''}${optionalRow('Publicação no PNCP', facts.source_published_at)}${optionalRow('Assinatura no cadastro', facts.signed_at)}${optionalRow('Início da vigência cadastrada', facts.starts_at)}${optionalRow('Fim da vigência cadastrada', facts.ends_at)}</dl><p class="news-facts-note">O alcance do valor e as condições de execução são explicados na matéria a partir dos documentos vinculados.</p><a class="news-register-link" href="${e(facts.source_url)}" target="_blank" rel="noopener">Abrir registro no PNCP</a></aside>`;
  const modified = article.modified_at !== article.published_at;
  const updateNote = modified ? '<p class="news-update-note">Matéria atualizada com a leitura dos documentos vinculados à contratação.</p>' : '';
  const main = `<article class="news-article news-article--reported"><header class="news-article-header"><p class="news-category">${e(categoryLabel(article.category))} <span>• Reportagem documental</span></p><h1>${e(article.title)}</h1><p class="news-deck">${e(article.lead)}</p><div class="news-byline"><span>Por <a href="/empresa/">CONFENGE</a></span><span>Publicado em <time datetime="${e(article.published_at)}">${e(publicationDate(article.published_at))}</time></span>${modified ? `<span>Atualizado em <time datetime="${e(article.modified_at)}">${e(publicationDate(article.modified_at))}</time></span>` : ''}</div>${updateNote}</header><div class="news-article-layout"><div class="news-story">${summary}${article.paragraphs.map(text => `<p>${e(text)}</p>`).join('')}${citations(editorial.source_ids)}${sections}${referenceList}${rawObject}</div>${ledger}</div></article>${commercial(article)}<p class="news-back"><a href="${PREFIX}">Ver todas as notícias de contratos públicos</a></p>`;
  const articleBody = [article.lead, ...article.paragraphs, ...editorial.sections.flatMap(section => [section.heading, ...section.paragraphs])].join('\n\n');
  const result = shell({ title: article.title, description: article.description, path: articlePath(article), main, article,
    graph: [{ '@type': 'NewsArticle', '@id': ORIGIN + articlePath(article) + '#article', mainEntityOfPage: ORIGIN + articlePath(article), url: ORIGIN + articlePath(article), headline: article.title, description: article.description, datePublished: article.published_at, dateModified: article.modified_at, inLanguage: 'pt-BR', articleSection: categoryLabel(article.category), author: { '@type': 'Organization', '@id': ORIGIN + '/#organization', name: 'CONFENGE', url: ORIGIN + '/empresa/' }, publisher: { '@id': ORIGIN + '/#organization' }, citation: sources.map(source => source.url), articleBody, wordCount: articleBody.split(/\s+/).length, isAccessibleForFree: true }] });
  result.html = result.html.replace('<body class="news-page"', `<body class="news-page" data-editorial-version="${e(article.editorial_version || '')}"`);
  return result;
}
export function renderError(status, path) {
  const unavailable = status === 503;
  return shell({ title: unavailable ? 'Notícias temporariamente indisponíveis' : 'Notícia não encontrada', description: 'Consulte as notícias de contratos públicos e as ferramentas da CONFENGE.', path, noindex: true, main: `<section class="news-empty"><h1>${unavailable ? 'As notícias estão temporariamente indisponíveis' : 'Não encontramos esta notícia'}</h1><p>${unavailable ? 'Tente novamente em alguns instantes. Você também pode pesquisar contratos no Radar Público.' : 'Acesse o índice para consultar as notícias publicadas.'}</p><a class="button button-primary" href="${unavailable ? '/ferramentas/radar-mercado-publico/' : PREFIX}">${unavailable ? 'Abrir Radar Público' : 'Ver notícias'}</a></section>` });
}
export function renderSitemap(snapshot, { news = false, now = new Date() } = {}) {
  const clock = new Date(now).getTime();
  const articles = sortedArticles(snapshot.articles).filter(article => !news || (Date.parse(article.published_at) <= clock && Date.parse(article.published_at) >= clock - 48 * 60 * 60 * 1000));
  const selected = news ? articles.slice(0, 1000) : articles;
  const rows = selected.map(article => `<url><loc>${ORIGIN + articlePath(article)}</loc>${news ? `<news:news><news:publication><news:name>CONFENGE</news:name><news:language>pt</news:language></news:publication><news:publication_date>${e(article.published_at)}</news:publication_date><news:title>${e(article.title)}</news:title></news:news>` : `<lastmod>${e(article.modified_at)}</lastmod>`}</url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${news ? ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"' : ''}>${!news && articles.length ? `<url><loc>${ORIGIN + PREFIX}</loc><lastmod>${e(snapshot.generated_at)}</lastmod></url>` : ''}${rows}</urlset>`;
}
export function renderFeed(snapshot) {
  const rows = sortedArticles(snapshot.articles).slice(0, 30).map(article => `<item><title>${e(article.title)}</title><link>${ORIGIN + articlePath(article)}</link><guid isPermaLink="true">${ORIGIN + articlePath(article)}</guid><description>${e(article.description)}</description><pubDate>${new Date(article.published_at).toUTCString()}</pubDate><category>${e(categoryLabel(article.category))}</category></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Notícias de obras e contratos públicos | CONFENGE</title><link>${ORIGIN + PREFIX}</link><description>Contratos de obras, projetos e infraestrutura registrados no PNCP.</description><language>pt-BR</language><lastBuildDate>${new Date(snapshot.generated_at).toUTCString()}</lastBuildDate><atom:link href="${ORIGIN + PREFIX}feed.xml" rel="self" type="application/rss+xml"/>${rows}</channel></rss>`;
}
