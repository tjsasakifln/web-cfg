import {Workspace,Project,NodeProperty,LinkProperty,InitHydOption} from '../rede-de-agua/vendor/epanet-0.8.0.js';
// OWA EPANET 2.2 toolkit enums: EN_NODECOUNT=0, EN_LINKCOUNT=2,
// EN_DURATION=0, EN_JUNCTION=0, EN_CVPIPE=0. Model-native units are retained.
const flows=['ft³/s','gal/min (US)','10⁶ gal/dia (US)','10⁶ gal/dia (imperial)','acre-ft/dia','L/s','L/min','ML/dia','m³/h','m³/dia'];
const num=v=>{if(!Number.isFinite(v))throw Error('O motor devolveu um valor numérico inválido.');return v;};
export async function simulate(text, scenario={mode:'base'}) {
 if(typeof text!=='string'||text.length>1024*1024||!/^\s*\[JUNCTIONS\]/im.test(text))throw Error('Use um arquivo INP de até 1 MiB com a seção JUNCTIONS.');
 if(!scenario||!['base','fire','shutdown'].includes(scenario.mode))throw Error('Cenário inválido.');
 // External hydraulics files are unavailable in the local virtual filesystem.
 if(/^\s*HYDRAULICS\s+(USE|SAVE)\b/im.test(text))throw Error('Remova a opção HYDRAULICS USE/SAVE: o cálculo usa somente este INP.');
 const ws=new Workspace();await ws.loadModule();if(ws.version!==20200)throw Error('Versão inesperada do EPANET.');
 ws.writeFile('model.inp',text);const p=new Project(ws);let opened=false,hyd=false;
 const warnings=[],original=console.warn;
 try {
  console.warn=(...args)=>warnings.push(args.join(' '));
  p.open('model.inp','model.rpt','model.bin');opened=true;
  const count=p.getCount(0),links=p.getCount(2),duration=p.getTimeParameter(0),units=p.getFlowUnits();
  if(count>1000||links>2000||duration>172800)throw Error('Limite: 1.000 nós, 2.000 trechos e 48 horas. Reduza o modelo ou a duração no INP.');
  if(!flows[units])throw Error('Unidade de vazão não reconhecida.');
  const unit={flow:flows[units],head:units<5?'ft':'m',velocity:units<5?'ft/s':'m/s',pressure:units<5?'psi':'mca'};
  // EPANET can explicitly request non-default pressure units in [OPTIONS].
  const pressureOption=text.match(/^\s*PRESSURE\s+(PSI|KPA|METERS)\s*(?:;.*)?$/im)?.[1]?.toUpperCase();
  if(pressureOption)unit.pressure={PSI:'psi',KPA:'kPa',METERS:'mca'}[pressureOption];
  const nodes=Array.from({length:count},(_,i)=>({index:i+1,id:p.getNodeId(i+1),type:p.getNodeType(i+1)}));
  const pipes=Array.from({length:links},(_,i)=>({index:i+1,id:p.getLinkId(i+1),type:p.getLinkType(i+1)}));
  let affected;
  if(scenario.mode==='fire') {
   if(typeof scenario.id!=='string'||!Number.isFinite(scenario.flow)||scenario.flow<=0||scenario.flow>1e6)throw Error('Informe o nó e uma vazão adicional positiva na unidade do modelo.');
   affected=nodes.find(n=>n.id===scenario.id&&n.type===0);if(!affected)throw Error('O ponto de vazão adicional deve ser uma junção existente.');
   // A private flat pattern prevents inheritance of the model's default pattern.
   let name='CFG_FIRE';while((text.includes(name)))name+='X';
   p.addPattern(name);const index=p.getPatternIndex(name);p.setPattern(index,[1]);
   p.addDemand(affected.index,scenario.flow,name,'CONFENGE_FIRE');
  } else if(scenario.mode==='shutdown') {
   affected=pipes.find(n=>n.id===scenario.id);if(!affected)throw Error('O trecho escolhido não existe no modelo.');
   if(affected.type===0)throw Error('Uma tubulação com válvula de retenção não aceita fechamento manual no EPANET. Escolha outro trecho.');
   p.setLinkValue(affected.index,LinkProperty.InitStatus,0);
  }
  p.saveInpFile('scenario.inp');
  p.openH();hyd=true;p.initH(InitHydOption.NoSave);
  const series=[],minPressure=new Map(),maxVelocity=new Map();let steps=0;
  do {
   const seconds=p.runH();
   if(warnings.length)throw Error('O EPANET registrou problema hidráulico ou de convergência: '+warnings[0]);
   if(scenario.mode==='shutdown'&&p.getLinkValue(affected.index,LinkProperty.Status)!==0)throw Error('Um controle ou regra reabriu o trecho. Revise os controles antes de simular fechamento permanente.');
   const snapshot={seconds,nodes:nodes.filter(n=>n.type===0).map(n=>({id:n.id,pressure:num(p.getNodeValue(n.index,NodeProperty.Pressure)),head:num(p.getNodeValue(n.index,NodeProperty.Head)),demand:num(p.getNodeValue(n.index,NodeProperty.Demand))})),links:pipes.map(n=>({id:n.id,flow:num(p.getLinkValue(n.index,LinkProperty.Flow)),velocity:num(Math.abs(p.getLinkValue(n.index,LinkProperty.Velocity))),status:p.getLinkValue(n.index,LinkProperty.Status)}))};
   for(const n of snapshot.nodes){const old=minPressure.get(n.id);if(!old||n.pressure<old.pressure)minPressure.set(n.id,{...n,seconds});}
   for(const n of snapshot.links){const old=maxVelocity.get(n.id);if(!old||n.velocity>old.velocity)maxVelocity.set(n.id,{...n,seconds});}
   series.push(snapshot);steps++;
   if(steps>500||steps*(count+links)>300000)throw Error('A simulação excedeu o limite de resultados. Aumente o passo hidráulico ou reduza o modelo.');
  }while(p.nextH()>0);
  return {engine:'OWA EPANET 2.2.0',unit,duration,scenario,steps,counts:{nodes:count,links},nodes:nodes.filter(n=>n.type===0),links:pipes,series,minPressure:[...minPressure.values()],maxVelocity:[...maxVelocity.values()],inp:ws.readFile('scenario.inp')};
 } finally {
  try{if(hyd)p.closeH();}finally{try{if(opened)p.close();}finally{console.warn=original;}}
 }
}
export async function compareInp(text,scenario){const base=await simulate(text);return {base,variant:scenario?.mode&&scenario.mode!=='base'?await simulate(text,scenario):null};}
