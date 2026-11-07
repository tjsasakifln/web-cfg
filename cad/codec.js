// Only local, dedicated Workers handle untrusted CAD bytes. Discard the heap after each job.
function convert(operation, name, bytes, after) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./codec-worker.mjs', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => done(reject, new Error('A conversão excedeu o tempo disponível. Divida o desenho e tente novamente.')), 90000);
    function done(callback, result) {
      clearTimeout(timer);
      worker.terminate();
      callback(result);
    }
    worker.onmessage = ({ data }) => data.error
      ? done(reject, new Error(data.error)) : done(resolve, data.result);
    worker.onerror = () => done(reject, new Error('O navegador interrompeu a conversão do arquivo.'));
    // Keep the original buffer with the caller for retries or an independent DXF download.
    try { worker.postMessage({ operation, name, bytes, after }); }
    catch (error) { done(reject, error); }
  });
}

export const prepareDrawing = (name, bytes) => convert('open', name, bytes);
export const encodeDrawing = (name, bytes) => convert('save', name, bytes);

export const compareImportBaseline = (before, after) => convert('compare', '', before, after);
