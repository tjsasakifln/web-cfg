import { parse } from 'parse5';

export const READY_PROJECT_PATH = '/projetos-prontos/';
export const READY_PROJECT_CONTEXT = Object.freeze({
  asset_id: 'ready-projects', cta_id: 'ready-projects-interest-submit',
  route_family: 'ready_projects', jornada: 'projeto', estagio: 'projetos-prontos',
});
export const READY_PROJECT_INTEREST = Object.freeze({
  kind: 'license', product_id: null, city: 'Florianópolis', uf: 'SC',
  lot_width_m: 10, lot_depth_m: 25, lot_status: 'owned', bedrooms: '2', build_when: 'unknown',
});

export function readyProjectFormMatches(html) {
  const attrs = node => Object.fromEntries((node.attrs || []).map(({name, value}) => [name, value]));
  const descendants = node => (node.childNodes || []).flatMap(child => [child, ...descendants(child)]);
  const forms = descendants(parse(html)).filter(node => node.tagName === 'form' && attrs(node).id === 'formulario-contato');
  if (forms.length !== 1) return false;
  const form = forms[0], a = attrs(form);
  if (a.name !== 'diagnostico-confenge' || a['data-intent'] !== 'ready_project_interest' ||
      a.method?.toLowerCase() !== 'post' || !['/api/web/lead', '/.netlify/functions/lead'].includes(a.action)) return false;
  const controls = descendants(form).filter(node => ['input', 'select'].includes(node.tagName));
  const active = name => controls.filter(node => {
    const value = attrs(node);
    if (value.name !== name || Object.hasOwn(value, 'disabled') || (value.form && value.form !== a.id)) return false;
    for (let p = node.parentNode; p && p !== form; p = p.parentNode) {
      if (p.tagName === 'fieldset' && Object.hasOwn(attrs(p), 'disabled')) return false;
    }
    return true;
  });
  for (const key of ['nome', 'consentimento', 'city', 'uf', 'lot_width_m', 'lot_depth_m', 'lot_status', 'bedrooms', 'build_when', 'project_kind']) {
    if (active(key).length !== 1) return false;
  }
  if (!active('email').length && !active('telefone').length) return false;
  for (const [field, value] of Object.entries({ project_kind: 'license', uf: 'SC', lot_status: 'owned', bedrooms: '2', build_when: 'unknown' })) {
    const node = active(field)[0];
    if (node.tagName === 'select' && !descendants(node).some(option => option.tagName === 'option' && attrs(option).value === value)) return false;
    if (node.tagName === 'input' && attrs(node).type === 'hidden' && attrs(node).value !== value) return false;
  }
  return true;
}
