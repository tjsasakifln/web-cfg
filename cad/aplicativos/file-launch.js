import { newHandoffId, putHandoff, dropHandoff, MAX_AGE_MS } from './studio/handoff.mjs';

// Only receivers equipped to consume a file from the official local handoff protocol.
const routes = {
  dwg: ['cadcraft','bimcraft','modelcraft','takeoffcraft'],
  dxf: ['cadcraft','bimcraft','modelcraft','takeoffcraft'],
  ifc: ['bimcraft','detailcraft'],
  pdf: ['markupcraft','takeoffcraft']
};
const sizeLimit = 64 * 1024 * 1024;
const extension = name => name.toLowerCase().match(/\.(dwg|dxf|ifc|pdf)$/)?.[1] || '';
const knownFormat = {
  dwg: text => /^AC10\d{2}/.test(text),
  dxf: text => /(?:^|[\r\n])\s*0\s*[\r\n]+\s*SECTION\b/i.test(text) || text.startsWith('AutoCAD Binary DXF'),
  ifc: text => /^\s*ISO-10303-21;/.test(text) && /FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(text),
  pdf: text => text.slice(0,1024).includes('%PDF-')
};
export function installFileLauncher(choose, names) {
  const panel = document.querySelector('#suite-file-form');
  const file = panel.querySelector('[data-drawing]'), app = panel.querySelector('[data-application]');
  const submit = panel.querySelector('[data-open-file]'), status = panel.querySelector('[role=status]');
  panel.hidden = false;
  function configure() {
    const compatible = routes[extension(file.files[0]?.name || '')] || [];
    app.replaceChildren(...compatible.map(slug => new Option(names.get(slug), slug)));
    if (!compatible.length) app.add(new Option('Escolha o arquivo primeiro', ''));
    app.disabled = submit.disabled = !compatible.length;
    status.textContent = file.files.length && !compatible.length ? 'Escolha um arquivo DWG, DXF, IFC ou PDF.' : '';
  }
  file.addEventListener('change', configure);
  configure();
  submit.addEventListener('click', async () => {
    const selected = file.files[0], slug = app.value;
    if (!selected || !routes[extension(selected.name)]?.includes(slug)) return;
    submit.disabled = file.disabled = app.disabled = true;
    let id;
    try {
      if (!selected.size || selected.size > sizeLimit) throw new Error('Escolha um arquivo com conteúdo e até 64 MiB.');
      const bytes = await selected.slice(0,32768).arrayBuffer();
      if (!knownFormat[extension(selected.name)](new TextDecoder().decode(bytes))) {
        throw new Error('O conteúdo não corresponde à extensão do arquivo. Confira o original.');
      }
      status.textContent = 'Preparando a abertura neste navegador…';
      id = newHandoffId();
      await putHandoff(id, selected, 'confenge');
      if (!choose(slug, true, id)) throw new Error('A abertura foi cancelada.');
      // The receiver consumes the record once. Unclaimed files also expire in the protocol.
      setTimeout(() => { dropHandoff(id).catch(() => {}); }, MAX_AGE_MS);
      status.textContent = 'Você pode abrir o arquivo selecionado em outro aplicativo.';
    } catch (error) {
      if (id) dropHandoff(id).catch(() => {});
      status.textContent = error.code === 'storage' || error instanceof DOMException
        ? 'O armazenamento local está indisponível. Abra a ferramenta e escolha o arquivo dentro dela.'
        : error.message || 'Não foi possível preparar o arquivo.';
    } finally { file.disabled = app.disabled = submit.disabled = false; }
  });
}
