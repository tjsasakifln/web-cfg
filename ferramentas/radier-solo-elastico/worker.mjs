import {calculate} from './engine.mjs';
self.onmessage=({data})=>{try{self.postMessage({ok:true,result:calculate(data)});}catch(error){self.postMessage({ok:false,message:error.message||'Não foi possível calcular o radier.'});}};
