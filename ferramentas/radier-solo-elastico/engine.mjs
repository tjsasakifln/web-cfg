import {cleanFrame} from './vendor/frame-model.js';
import {solveFrame} from './vendor/frame-solve.js';

const limits={length:[.5,100],width:[.5,100],thickness:[.08,2],elasticity:[1,100],poisson:[0,.45],soil:[100,1e7],pressure:[0,1e5],pointLoad:[0,1e7],nx:[2,24],ny:[2,24]};
export const example={length:10,width:8,thickness:.25,elasticity:30,poisson:.2,soil:20000,pressure:20,pointLoad:0,pointX:5,pointY:4,nx:12,ny:10};
export function validate(input){
 const out={};
 for(const [key,[min,max]] of Object.entries(limits)){
  const value=input?.[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Valor fora do intervalo permitido: '+key+'.');
  if((key==='nx'||key==='ny')&&!Number.isInteger(value))throw Error('O número de divisões deve ser inteiro.');
  out[key]=value;
 }
 for(const [key,max]of[['pointX',out.length],['pointY',out.width]]){const v=input?.[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('A carga pontual deve estar dentro do radier.');out[key]=v;}
 if(out.pressure===0&&out.pointLoad===0)throw Error('Informe pelo menos uma carga vertical.');
 const ratio=(out.length/out.nx)/(out.width/out.ny);if(ratio<.1||ratio>10)throw Error('Ajuste as divisões para que a proporção dos elementos fique entre 1:10 e 10:1.');
 return out;
}
export function buildModel(input){
 const p=validate(input),nodes=[],plates=[],supports=[],loads=[],areas=[];
 const dx=p.length/p.nx,dy=p.width/p.ny,cell=dx*dy,id=(i,j)=>'N'+(j*(p.nx+1)+i);
 for(let j=0;j<=p.ny;j++)for(let i=0;i<=p.nx;i++){
  const area=cell*(i===0||i===p.nx?.5:1)*(j===0||j===p.ny?.5:1);areas.push(area);
  nodes.push({id:id(i,j),x:i*dx*1000,y:j*dy*1000,z:0});
  // k_s [kN/m³] × tributary area [m²] = kN/m = N/mm.
  supports.push({node:id(i,j),fix:[true,true,false,false,false,true],k:[0,0,p.soil*area,0,0,0]});
 }
 for(let j=0;j<p.ny;j++)for(let i=0;i<p.nx;i++){
  const plate='P'+(j*p.nx+i);plates.push({id:plate,nodes:[id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1)],t:p.thickness*1000,material:'concrete'});
  loads.push({type:'area',plate,dir:'Z',p:-p.pressure/1000});
 }
 if(p.pointLoad){
  const i=Math.min(p.nx-1,Math.floor(p.pointX/dx)),j=Math.min(p.ny-1,Math.floor(p.pointY/dy)),a=(p.pointX-i*dx)/dx,b=(p.pointY-j*dy)/dy;
  for(const [ii,jj,w]of[[i,j,(1-a)*(1-b)],[i+1,j,a*(1-b)],[i+1,j+1,a*b],[i,j+1,(1-a)*b]])if(w>0)loads.push({type:'node',node:id(ii,jj),F:[0,0,-p.pointLoad*1000*w,0,0,0]});
 }
 const E=p.elasticity*1000;
 const raw={format:'cadcraft-frame',version:1,name:'CONFENGE | Radier sobre solo elástico',nodes,materials:[{id:'concrete',name:'Concreto elástico',E,G:E/(2*(1+p.poisson)),rho:0}],sections:[],members:[],plates,supports,cases:[{id:'S',name:'Cargas informadas',kind:'other',selfWeight:0,loads}],combos:[]};
 const cleaned=cleanFrame(raw);if(cleaned.warnings.length)throw Error('O modelo não pôde ser montado integralmente.');
 return {input:p,model:cleaned.model,areas};
}
export function calculate(input){
 const {input:p,model,areas}=buildModel(input);const solved=solveFrame(model);if(!solved.ok)throw Error('Não foi possível resolver o modelo: '+solved.error.code+'.');
 const r=solved.results['case:S'];
 const nodes=model.nodes.map((n,i)=>({id:n.id,x:n.x/1000,y:n.y/1000,area:areas[i],settlement:-r.u[i*6+2],reaction:r.reactions[i*6+2]/1000,pressure:r.reactions[i*6+2]/(1000*areas[i])}));
 const plates=model.plates.map((e,i)=>({id:e.id,nodes:e.nodes,mx:r.plates[i*8+3]/1000,my:r.plates[i*8+4]/1000,mxy:r.plates[i*8+5]/1000,qx:r.plates[i*8+6],qy:r.plates[i*8+7]}));
 for(const n of nodes)if(!Object.values(n).filter(x=>typeof x==='number').every(Number.isFinite))throw Error('O cálculo produziu um resultado não finito.');
 for(const n of plates)if(![n.mx,n.my,n.mxy,n.qx,n.qy].every(Number.isFinite))throw Error('O cálculo produziu um esforço não finito.');
 const applied=p.pressure*p.length*p.width+p.pointLoad,reaction=nodes.reduce((s,n)=>s+n.reaction,0),balance=Math.abs(applied-reaction)/Math.max(applied,1);
 if(balance>1e-6)throw Error('O equilíbrio global não atingiu a tolerância. Revise a malha e as rigidezes.');
 const minPressure=Math.min(...nodes.map(n=>n.pressure));
 return {schema:'confenge.raft-winkler/v1',engine:'MITC4 / BIMCraft 0.8.1 / Apache-2.0',input:p,nodes,plates,summary:{applied,reaction,balance,minPressure,maxPressure:Math.max(...nodes.map(n=>n.pressure)),maxSettlement:Math.max(...nodes.map(n=>n.settlement)),maxAbsMxMy:Math.max(...plates.flatMap(e=>[Math.abs(e.mx),Math.abs(e.my)]))},warnings:[...(minPressure<-.001?['O modelo linear encontrou tração no solo. O resultado exige análise com perda de contato; não use essas pressões para dimensionar a fundação.']:[]),...solved.warnings.map(w=>'Aviso do motor: '+w.code)],assumptions:['Placa retangular, homogênea e elástica, com bordas livres e molas verticais de Winkler em todos os nós.','O coeficiente de reação do solo é informado pelo usuário. A ferramenta não estima capacidade de carga nem recalque de adensamento.','O peso próprio não é acrescentado automaticamente. Inclua todas as ações e combinações desejadas nas cargas informadas.','Molas lineares admitem tração. Perda de contato, fissuração, punção e dimensionamento de armadura não são calculados.','A carga pontual é distribuída pelos quatro nós do elemento por interpolação bilinear, conservando a força e seus momentos globais.','Momentos e cortantes são os valores no centro de cada elemento. Refine a malha e compare a convergência antes de utilizar os esforços.']};
}
