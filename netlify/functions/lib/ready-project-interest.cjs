/* Qualified residential enquiries use the existing durable lead pipeline. */
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const ENUMS = {
  kind: ['license', 'adaptation', 'complementary', 'custom'],
  lot_status: ['owned', 'buying', 'searching', 'unknown'],
  bedrooms: ['2', '3', 'other', 'unknown'],
  build_when: ['0_6m', '6_12m', 'over_12m', 'unknown'],
};
const fail = (field, message) => ({ ok: false, status: 422, error: 'project_interest_invalid', field, message });
function normalizeProjectInterest(data) {
  const handled = data.intent === 'ready_project_interest' || data.route_family === 'ready_projects'
    || data.estagio === 'projetos-prontos' || data.project_interest != null;
  if (!handled) return { ok: true, handled: false };
  if (data.project_interest != null && (typeof data.project_interest !== 'object' || Array.isArray(data.project_interest)))
    return fail('project_interest', 'Confira os dados da solicitação.');
  const raw = data.project_interest || { kind: data.project_kind, product_id: data.product_id,
    city: data.city, uf: data.uf, lot_width_m: data.lot_width_m, lot_depth_m: data.lot_depth_m,
    lot_status: data.lot_status, bedrooms: data.bedrooms, build_when: data.build_when };
  const out = {};
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const value = raw[key] == null || raw[key] === '' ? (key === 'kind' ? '' : 'unknown') : raw[key];
    if (typeof value !== 'string' || !allowed.includes(value)) return fail(key, 'Selecione uma opção válida para o interesse e os dados da casa.');
    out[key] = value;
  }
  const city = typeof raw.city === 'string' ? raw.city.trim().replace(/\s+/g, ' ') : '';
  if (city.length < 2 || city.length > 80 || !/^[\p{L}\p{M}\d .'-]+$/u.test(city))
    return fail('city', 'Informe o município do terreno, sem endereço ou outros dados pessoais.');
  const uf = typeof raw.uf === 'string' ? raw.uf.trim().toUpperCase() : '';
  if (!UFS.has(uf)) return fail('uf', 'Selecione a UF do terreno.');
  out.city = city; out.uf = uf;
  for (const key of ['lot_width_m', 'lot_depth_m']) {
    const value = raw[key];
    if (value == null || value === '') { out[key] = null; continue; }
    const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim().replace(',', '.') : '';
    const n = Number(text);
    if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(n) || n < 0.5 || n > 10000)
      return fail(key, 'Informe a dimensão em metros ou deixe o campo em branco se não souber.');
    out[key] = n;
  }
  out.product_id = null;
  if (raw.product_id != null && raw.product_id !== '') {
    if (typeof raw.product_id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(raw.product_id))
      return fail('product_id', 'O projeto indicado não está disponível para consulta.');
    let catalog;
    try { catalog = require('../../../data/projects-ready/catalog.v1.json'); }
    catch { return fail('product_id', 'Consulte a disponibilidade sem selecionar um projeto.'); }
    if (!catalog.products.some(p => p.id === raw.product_id && p.status === 'approved'))
      return fail('product_id', 'O projeto indicado não está disponível para consulta.');
    out.product_id = raw.product_id;
  }
  return { ok: true, handled: true, interest: out };
}
module.exports = { normalizeProjectInterest };
