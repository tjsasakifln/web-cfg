import {validarEnvelope} from './ifc-envelope.mjs';
export {validarEnvelope,LIMITE_IFC} from './ifc-envelope.mjs';

// O mesmo leitor atende às três ferramentas em página ou worker.
export async function comModelo(dados, ler, options = {}) {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  validarEnvelope(bytes);
  const IFC = await import('./vendor/web-ifc/web-ifc-api.js');
  const api = new IFC.IfcAPI();
  await api.Init(nome => new URL('./vendor/web-ifc/' + nome, import.meta.url).href, true);
  let id = -1;
  try {
    try {
      id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: options.coordinateToOrigin !== false, MEMORY_LIMIT: 512 * 1024 * 1024 });
    } catch {
      throw new Error('Não foi possível interpretar o IFC. Confira o esquema e a integridade do arquivo.');
    }
    if (id < 0) throw new Error('O leitor não reconheceu o esquema IFC deste arquivo.');
    return await ler(api, id, IFC);
  } finally {
    if (id >= 0) api.CloseModel(id);
    api.Dispose();
  }
}
