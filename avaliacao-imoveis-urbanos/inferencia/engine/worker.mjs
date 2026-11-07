import {loadPyodide} from './runtime/pyodide.mjs';
const base = new URL('./runtime/', import.meta.url).href;
let engine;
let queue = Promise.resolve();
const extracted = new Set();

async function unpack(py, name) {
  if (extracted.has(name)) return;
  const response = await fetch(new URL(name, base));
  if (!response.ok) throw new Error('Arquivo de cálculo indisponível. Recarregue e tente novamente.');
  py.unpackArchive(await response.arrayBuffer(),'zip',{extractDir:'/home/pyodide/modela'});
  extracted.add(name);
}
async function init() {
  const py = await loadPyodide({indexURL:base});
  await unpack(py,'modela.zip');
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/modela'); import browser_core");
  return py;
}
async function handle({id,action,payload}) {
  try {
    engine ??= init().catch(error=>{engine=undefined;extracted.clear();throw error;});
    const py = await engine;
    let output;
    if (action === 'readFile') {
      if (/\.xlsx$/i.test(payload.name)) for (const archive of ['xmlfile.zip','defusedxml.zip','xlsx.zip']) await unpack(py,archive);
      py.globals.set('file_name',payload.name);
      py.FS.writeFile('/tmp/planilha',new Uint8Array(payload.bytes));
      try { output=py.runPython("browser_core.pack(browser_core.read_file(file_name, '/tmp/planilha'))"); }
      finally { py.FS.unlink('/tmp/planilha'); py.globals.delete('file_name'); }
    } else {
      if (!['calculate','cost'].includes(action)) throw new Error('Operação desconhecida.');
      if (action === 'calculate') { await py.loadPackage('statsmodels'); await unpack(py,'dotenv.zip'); }
      py.globals.set('incoming',JSON.stringify(payload));
      try { output=py.runPython(action==='cost' ? "browser_core.call_cost(incoming)" : "browser_core.call_calculate(incoming)"); }
      finally { py.globals.delete('incoming'); }
    }
    postMessage({id,result:JSON.parse(output)});
  } catch(error) {
    const parts=String(error.message??error).trim().split('\n');
    const last=parts.at(-1).replace(/^(?:ValueError|RuntimeError|TypeError|Error):\s*/, '');
    postMessage({id,error:last.slice(0,580)||'Não foi possível concluir o cálculo.'});
  }
}
self.onmessage = ({data}) => { queue=queue.then(()=>handle(data)); };
