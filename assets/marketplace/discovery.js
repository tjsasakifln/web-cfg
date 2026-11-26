const marketplace = '/profissionais/';
const registration = `${marketplace}#cadastro-profissional`;

function link(text, href, position, identifier) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = text;
  Object.assign(anchor.dataset, {
    eventName: 'cta_click',
    ctaPosition: position,
    ctaId: identifier,
    navigationLink: 'true',
  });
  return anchor;
}

function destination(panel, firstService, position, id, title, href, description) {
  const anchor = link(title, href, position, `nav-${position}-servicos-${id}`);
  anchor.className = 'nav-destination';
  anchor.dataset.navDestination = id;
  const detail = document.createElement('span');
  detail.className = 'nav-destination__description';
  detail.textContent = description;
  anchor.append(detail);
  panel.insertBefore(anchor, firstService);
}

for (const panel of document.querySelectorAll('details[data-nav-group="servicos"] > .nav-panel')) {
  const menu = panel.closest('nav');
  const position = menu?.matches('.mobile-nav, .pp-mobile nav') ? 'mobile_nav' : 'header_nav';
  const firstService = panel.querySelector('.nav-destination, .nav-overview');
  destination(panel, firstService, position, 'marketplace', 'Marketplace de serviços', marketplace,
    'Encontre profissionais de engenharia e arquitetura e peça uma proposta.');
  destination(panel, firstService, position, 'cadastro-profissional', 'Cadastro profissional', registration,
    'Crie seu perfil para apresentar seus serviços a quem precisa contratar.');
}

const footer = document.querySelector('.site-footer .footer-brand, .pp-footer .footer-brand');
if (footer) {
  const callout = document.createElement('p');
  const emphasis = document.createElement('strong');
  emphasis.append(link('Cadastro para engenheiros e arquitetos', registration, 'footer', 'marketplace-provider-signup-footer'));
  callout.append(emphasis);
  footer.append(callout);
}

// Site-wide invitation strip: tools for every visitor, profile sign-up for
// engineers and architects. A thin, dismissible band in normal flow at the end
// of <main>: it covers nothing, shifts nothing above it, and the mobile menu's
// inert backdrop (which includes <main>) already covers it. The destination
// page drops its own invitation.
(() => {
  const path = window.location.pathname;
  if (/^\/(obrigado|termos-de-uso|privacidade|comercial|piloto)/.test(path)) return;
  const key = 'confenge_site_invite_hidden_until';
  try {
    if (Number(window.localStorage.getItem(key) || 0) > Date.now()) return;
  } catch { /* storage blocked: keep showing */ }
  const header = document.querySelector('.site-header, .pp-header');
  const main = document.querySelector('main');
  if (!header || !main || document.querySelector('.site-invite')) return;

  const onTools = /^\/(ferramentas|cad|bim)(\/|$)/.test(path);
  const onMarketplace = path.startsWith(marketplace);
  // The marketplace is an application with its own views; leave it untouched.
  if (onMarketplace) return;
  const items = [];
  if (!onTools) {
    items.push(['Ferramentas de engenharia no navegador: DWG, IFC, orçamento, BDI e cálculos.',
      'Ver ferramentas', '/ferramentas/', 'site-invite-tools']);
  }
  if (!onMarketplace) {
    items.push(['É engenheiro ou arquiteto? Cadastre seu perfil e receba pedidos de proposta.',
      'Cadastrar perfil', registration, 'site-invite-marketplace-signup']);
  }
  if (!items.length) return;

  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = '/assets/marketplace/site-invite.css';
  document.head.append(sheet);

  const strip = document.createElement('aside');
  strip.className = 'site-invite';
  strip.setAttribute('aria-label', 'Convites da CONFENGE');
  const list = document.createElement('div');
  list.className = 'site-invite__items';
  for (const [text, label, href, id] of items) {
    const row = document.createElement('p');
    row.className = 'site-invite__item';
    row.append(document.createTextNode(`${text} `), link(label, href, 'site_invite', id));
    list.append(row);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'site-invite__close';
  close.setAttribute('aria-label', 'Ocultar convites');
  close.textContent = '×';
  // Guarantee the 44x44 touch target even before the stylesheet applies.
  Object.assign(close.style, { minWidth: '44px', minHeight: '44px' });
  close.addEventListener('click', () => {
    strip.remove();
    try {
      window.localStorage.setItem(key, String(Date.now() + 14 * 24 * 60 * 60 * 1000));
    } catch { /* storage blocked: hide for this page only */ }
  });
  strip.append(list, close);
  // Insert only once the strip's own stylesheet is ready, so it is never
  // measured or shown unstyled.
  const show = () => { if (!strip.isConnected) main.append(strip); };
  if (sheet.sheet) show();
  else sheet.addEventListener('load', show, { once: true });
})();
