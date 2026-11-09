export const example = {
  head: "36", min: "0", required: "10", factor: "1,5",
  nodes: "J1;15;0;12;0\nP1;19;0,8;24;7\nP2;24;0,5;24;-7",
  pipes: "T1;R;J1;55;50;130;1\nT2;J1;P1;35;32;130;2\nT3;J1;P2;40;25;130;2"
};

function number(v, label, low, high) {
  const s=String(v??"").trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(s)) throw Error(label + ": informe um número.");
  const n=Number(s.replace(",","."));
  if (!Number.isFinite(n) || n<low || n>high) throw Error(label + ": valor fora do intervalo de " + low + " a " + high + ".");
  return n;
}
function id(s, label) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,22}$/.test(s)) throw Error(label + ": use identificador iniciado por letra, de até 23 caracteres, sem espaços.");
  return s.toUpperCase();
}
function rows(raw, name, cols, limit) {
  if(typeof raw !== "string" || raw.length > 40000) throw Error(name + ": tabela muito extensa.");
  const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length || lines.length>limit) throw Error(name + ": informe entre 1 e " + limit + " linhas.");
  return lines.map((line,index)=>{
    const cells=line.split(line.includes("\t") ? "\t" : ";").map(s=>s.trim());
    if(cells.length!==cols) throw Error(name + ", linha " + (index+1) + ": são necessárias " + cols + " colunas.");
    return cells;
  });
}
export function readNetwork(raw) {
  const head=number(raw.head,"Nível de água",-1000,8000);
  const min=number(raw.min,"Pressão para início do atendimento",0,999);
  let required=number(raw.required,"Pressão para atendimento integral",0.1,1000);
  if(required-min<0.1) {
    // EPANET compares the binary difference against 0.1 m. Preserve an exact
    // decimal boundary such as 0.3 - 0.2 when binary subtraction rounds down.
    const tolerance=Number.EPSILON*Math.max(1,required,min);
    if(0.1-(required-min)>tolerance) throw Error("A diferença entre as pressões de atendimento deve ser de pelo menos 0,10 mca.");
    required+=tolerance;
  }
  const factor=number(raw.factor,"Multiplicador de consumo",0.01,100);
  const graph=new Map([["R",[]]]);
  const nodes=rows(raw.nodes,"Pontos",5,160).map(([code,z,q,x,y],i)=>{
    const row="Pontos, linha " + (i+1);
    code=id(code,row);
    if(graph.has(code)) throw Error(row + ": identificador duplicado ou reservado (R).");
    graph.set(code,[]);
    return {id:code,z:number(z,row+" • cota",-1000,8000),q:number(q,row+" • demanda",0,10000),
      x:number(x,row+" • X",-10000000,10000000),y:number(y,row+" • Y",-10000000,10000000)};
  });
  if(!nodes.some(n=>n.q>0)) throw Error("Inclua pelo menos um ponto com demanda maior que zero.");
  const used=new Set();
  const pipes=rows(raw.pipes,"Trechos",7,320).map(([code,a,b,len,d,c,k],i)=>{
    const row="Trechos, linha " + (i+1);
    code=id(code,row); a=id(a,row); b=id(b,row);
    if(used.has(code)) throw Error(row+": identificador de trecho repetido.");
    if(a===b || !graph.has(a) || !graph.has(b)) throw Error(row+": ligue dois pontos distintos existentes ou o reservatório R.");
    used.add(code);graph.get(a).push(b);graph.get(b).push(a);
    return {id:code,a,b,len:number(len,row+" • comprimento",0.01,100000),d:number(d,row+" • diâmetro",1,10000),
      c:number(c,row+" • coeficiente C",1,200),k:number(k,row+" • perda localizada",0,10000)};
  });
  const connected=new Set(["R"]),queue=["R"];
  for(let i=0;i<queue.length;i++) for(const next of graph.get(queue[i])) if(!connected.has(next)){connected.add(next);queue.push(next);}
  const isolated=nodes.find(n=>!connected.has(n.id));
  if(isolated) throw Error("O ponto " + isolated.id + " não tem ligação com o reservatório R.");
  return {head,min,required,factor,nodes,pipes};
}

export function toInp(m, factor=1) {
  return ["[TITLE]","Rede de agua | CONFENGE","[JUNCTIONS]","; ID Elev(m) Demand(L/s)",
    ...m.nodes.map(n=>[n.id,n.z,String(n.q*factor)].join(" ")),
    "[RESERVOIRS]","R "+m.head,"[PIPES]","; ID From To Length(m) Diameter(mm) C K Status",
    ...m.pipes.map(p=>[p.id,p.a,p.b,p.len,p.d,p.c,p.k,"Open"].join(" ")),
    "[OPTIONS]","UNITS LPS","HEADLOSS H-W","DEMAND MODEL PDA","MINIMUM PRESSURE "+m.min,
    "REQUIRED PRESSURE "+m.required,"PRESSURE EXPONENT 0.5","ACCURACY 0.0001","TRIALS 150","UNBALANCED STOP",
    "[TIMES]","DURATION 0","[REPORT]","NODES ALL","LINKS ALL","DEMAND PRECISION 6","PRESSURE PRECISION 6","FLOW PRECISION 6","VELOCITY PRECISION 6","[COORDINATES]","R 0 0",...m.nodes.map(n=>[n.id,n.x,n.y].join(" ")),"[END]",""].join("\n");
}
