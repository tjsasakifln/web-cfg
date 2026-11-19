import {compareInp} from './engine.mjs';
self.onmessage=async({data})=>{try{self.postMessage({ok:true,result:await compareInp(data.text,data.scenario)});}catch(e){self.postMessage({ok:false,message:e.message});}};
