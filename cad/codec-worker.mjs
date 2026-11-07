import { compareBaseline, convertDrawing } from './drawing.mjs';
self.onmessage = async ({ data }) => {
  try {
    if (data.operation === 'compare') {
      self.postMessage({ result: compareBaseline(data.bytes, data.after) });
      return;
    }
    const result = await convertDrawing(data.operation, data.name, data.bytes);
    self.postMessage({ result }, [result.bytes]);
  } catch (error) {
    self.postMessage({ error: String(error?.message || 'Falha na conversão do desenho.').slice(0, 400) });
  }
};
