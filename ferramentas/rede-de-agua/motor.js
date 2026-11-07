import {Workspace, Project, NodeProperty, LinkProperty, InitHydOption} from "./vendor/epanet-0.8.0.js";
import {toInp} from "./rede.js";

export async function compare(network) {
  const ws=new Workspace();
  await ws.loadModule();
  if (ws.version !== 20200) throw Error("Versão inesperada do motor EPANET.");
  function solve(multiplier) {
    const p=new Project(ws);
    ws.writeFile("rede.inp",toInp(network,multiplier));
    let opened=false,hydraulic=false;
    const warnings=[];
    const originalWarn=console.warn;
    try {
      // The wrapper sends EPANET codes 1–99 to console.warn. Capture them in this
      // dedicated worker so convergence problems cannot become valid results.
      console.warn=(...message)=>warnings.push(message.join(" "));
      p.open("rede.inp","rede.rpt","rede.bin"); opened=true;
      p.openH(); hydraulic=true;p.initH(InitHydOption.NoSave);p.runH();
      if(warnings.length) throw Error("O EPANET emitiu um aviso hidráulico. Confira os níveis e as dimensões. "+warnings[0]);
      const nodes=network.nodes.map(n=>{
        const i=p.getNodeIndex(n.id);
        const demand=n.q*multiplier;
        const solverDemand=p.getNodeValue(i,NodeProperty.Demand);
        const pressure=p.getNodeValue(i,NodeProperty.Pressure);
        // The PDA solver regularizes its curve near the bounds. Preserve the
        // raw value for diagnosis and report demand served within [0, demand].
        const delivered=pressure<=network.min ? 0 : pressure>=network.required ? demand : Math.min(demand,Math.max(0,solverDemand));
        return {id:n.id,demand,delivered,solverDemand,pressure};
      });
      const pipes=network.pipes.map(t=>{
        const i=p.getLinkIndex(t.id);
        const load=id=>p.getNodeValue(p.getNodeIndex(id),NodeProperty.Head);
        return {id:t.id,flow:p.getLinkValue(i,LinkProperty.Flow),velocity:Math.abs(p.getLinkValue(i,LinkProperty.Velocity)),loss:Math.abs(load(t.a)-load(t.b))};
      });
      if([...nodes,...pipes].some(row=>Object.values(row).some(v=>typeof v==="number"&&!Number.isFinite(v)))) throw Error("O EPANET devolveu um resultado numérico inválido.");
      return {nodes,pipes};
    } finally {
      try {if(hydraulic)p.closeH();} finally {try {if(opened)p.close();} finally {console.warn=originalWarn;}}
    }
  }
  return {base:solve(1),variant:solve(network.factor)};
}
if(typeof self!=="undefined"&&typeof document==="undefined") self.onmessage=async ({data})=>{
  try {self.postMessage({ok:true,result:await compare(data)});} catch(e){self.postMessage({ok:false,message:e.message});}
};
