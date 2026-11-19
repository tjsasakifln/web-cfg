import {parseDrawing} from './parser.mjs';
import {quantify} from './takeoff.mjs';
self.onmessage = ({data}) => {
  try {
    if(typeof data.text!=='string'||data.text.length>20*1024*1024)throw Error('Escolha um DXF ASCII de até 20 MiB.');
    const drawing = parseDrawing(data.text);
    self.postMessage({ok:true,result:quantify(drawing,data.unit===''?null:data.unit)});
  } catch(e) {self.postMessage({ok:false,message:e.message||'Não foi possível ler o desenho DXF.'});}
};
