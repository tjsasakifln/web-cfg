// One local worker per page. Never send the visitor's files or projects to an API.
let worker;
let sequence = 0;
const pending = new Map();

function fail(message) {
  if (worker) worker.terminate();
  worker = undefined;
  for (const job of pending.values()) job.reject(new Error(message));
  pending.clear();
}
function run(action, payload, transfer = []) {
  if (!worker) {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), {type:'module'});
    worker.onerror = () => fail('Falha ao iniciar o motor local. Atualize a página e tente novamente.');
    worker.onmessage = ({data}) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.result);
    };
  }
  const id = ++sequence;
  return new Promise((resolve,reject) => {
    pending.set(id,{resolve,reject});
    try { worker.postMessage({id,action,payload},transfer); }
    catch(error) { pending.delete(id); reject(error); }
  });
}
export async function readFile(file) {
  if (file.size > 8*1024*1024) throw new Error('Escolha uma planilha de até 8 MB.');
  const bytes = await file.arrayBuffer();
  return run('readFile', {name:file.name,bytes}, [bytes]);
}
export const calculate = payload => run('calculate',payload);
export const cost = payload => run('cost',payload);
export const cancel = () => fail('Operação cancelada.');
