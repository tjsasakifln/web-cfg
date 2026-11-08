// The selected CONFENGE edition runs in its own document, apart from site navigation.
const applications = new Set(['cadcraft', 'bimcraft', 'modelcraft', 'markupcraft', 'takeoffcraft', 'civilcraft', 'detailcraft', 'partcraft']);
export function runtimeURL(slug) {
  if (!applications.has(slug)) throw new Error('Aplicativo desconhecido.');
  return '/cad/suite/runtime/' + slug + '/';
}
