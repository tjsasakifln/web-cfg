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

function destination(panel, overview, position, id, title, href, description) {
  const anchor = link(title, href, position, `nav-${position}-servicos-${id}`);
  anchor.className = 'nav-destination';
  anchor.dataset.navDestination = id;
  const detail = document.createElement('span');
  detail.className = 'nav-destination__description';
  detail.textContent = description;
  anchor.append(detail);
  panel.insertBefore(anchor, overview);
}

for (const panel of document.querySelectorAll('details[data-nav-group="servicos"] > .nav-panel')) {
  const menu = panel.closest('nav');
  const position = menu?.matches('.mobile-nav, .pp-mobile nav') ? 'mobile_nav' : 'header_nav';
  const overview = panel.querySelector('.nav-overview');
  destination(panel, overview, position, 'marketplace', 'Marketplace de serviços', marketplace,
    'Encontre profissionais de engenharia e arquitetura e peça uma proposta.');
  destination(panel, overview, position, 'cadastro-profissional', 'Cadastro profissional', registration,
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
