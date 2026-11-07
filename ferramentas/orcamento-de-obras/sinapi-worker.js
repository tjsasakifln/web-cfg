import { importarXlsx } from './sinapi-base.js';
self.onmessage = ({data}) => {
  try { self.postMessage(importarXlsx(data.buffer, data.uf, data.tipo, data.regime)); }
  catch (error) { self.postMessage({erro:error.message}); }
};
