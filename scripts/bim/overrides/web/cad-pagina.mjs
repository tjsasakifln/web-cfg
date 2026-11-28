import {extrairPagina} from './cad-geometria.mjs';
import {protegerTrabalho} from './proteger-trabalho.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';
const el=id=>document.getElementById(id);
const trabalho=protegerTrabalho();
let versao=0,arquivo=null,documento=null,carregamento=null,pagina=null,worker=null,tempo,link=null,resultado=null,folhaPronta=0;
function status(s){el('mensagem').textContent=s;}
function baixarLimpo(){link=null;resultado=null;el('cadsaida').hidden=true;el('cadsaida').removeAttribute('href');}
function parar(){worker?.terminate();worker=null;clearTimeout(tempo);el('cancelar').hidden=true;trabalho.concluir('processamento:cad');}
function atualizar(){el('gerar').disabled=!arquivo||!!worker||(arquivo.name.toLowerCase().endsWith('.pdf')&&(!pagina||folhaPronta!==el('folha').valueAsNumber||!el('escala').checkValidity()));}
let referencia=null;
function encerrarCalibracao(){referencia=null;el('passo').textContent='';el('original').style.cursor='';}
function limparPagina(){encerrarCalibracao();pagina=null;folhaPronta=0;el('visual').hidden=true;baixarLimpo();atualizar();}
function erro(e){status(e?.message||'Não foi possível ler este arquivo.');}
async function conferir(){
  if(!documento)return;
  const turno=++versao,folha=el('folha').valueAsNumber;
  parar();limparPagina();
  if(!Number.isInteger(folha)||folha<1||folha>documento.numPages){status('Selecione uma das '+documento.numPages+' páginas.');return;}
  trabalho.marcar('desenho');trabalho.marcar('processamento:cad');
  try{
    status('Lendo a folha…');
    const page=await documento.getPage(folha),vista=page.getViewport({scale:1});
    if(vista.width<=0||vista.height<=0||!Number.isFinite(vista.width+vista.height))throw new Error('Dimensões da página inválidas.');
    const [lista,camadas]=await Promise.all([page.getOperatorList(),documento.getOptionalContentConfig({intent:'display'})]);
    const {OPS}=await import('./vendor-cad/pdf.mjs');
    const dados=extrairPagina(lista,OPS,vista,{
      usarFonte:id=>id&&page.commonObjs.has(id)?page.commonObjs.get(id):null,
      conteudoVisivel:grupo=>camadas.isVisible(grupo),
    });
    if(turno!==versao)return;
    const view=page.getViewport({scale:Math.min(2,1200/Math.max(vista.width,vista.height))});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    if(turno!==versao)return;
    for(const id of ['original','sobre']){el(id).width=canvas.width;el(id).height=canvas.height;}
    el('original').getContext('2d').drawImage(canvas,0,0);
    const ctx=el('sobre').getContext('2d');ctx.strokeStyle='#008df0';ctx.lineWidth=1.5;ctx.beginPath();
    for(const [a,b] of dados.linhas){ctx.moveTo(a[0]/dados.largura*view.width,view.height-a[1]/dados.altura*view.height);ctx.lineTo(b[0]/dados.largura*view.width,view.height-b[1]/dados.altura*view.height);}
    ctx.stroke();
    ctx.fillStyle='rgba(0,141,240,.16)';
    for(const aneis of dados.preenchimentos){
      ctx.beginPath();
      for(const anel of aneis){
        for(const [i,[x,y]] of anel.entries())ctx[i?'lineTo':'moveTo'](x/dados.largura*view.width,view.height-y/dados.altura*view.height);
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
    el('visual').hidden=false;
    if(!dados.entidades.length)throw new Error('Nenhum traço ou texto vetorial nesta página. Para uma folha escaneada, use a ferramenta de digitalização.');
    pagina=dados;folhaPronta=folha;status([dados.linhas.length+' traços, '+dados.textos.length+' textos e '+dados.preenchimentos.length+' preenchimentos na página '+folha+'.',...dados.avisos].join('\n'));
  }catch(e){if(turno===versao)erro(e);}finally{trabalho.concluir('processamento:cad');if(turno===versao)atualizar();}
}
el('arquivo').onchange=async()=>{
  if(trabalho.pendente('desenho') && !confirm('Descartar o desenho em andamento e abrir outro arquivo?')){el('arquivo').value='';return;}
  trabalho.concluir('desenho');trabalho.concluir('calibracao');
  const turno=++versao;parar();arquivo=null;documento=null;carregamento?.destroy().catch(()=>{});carregamento=null;limparPagina();el('pdf').hidden=true;status('');
  const f=el('arquivo').files[0];if(!f)return;
  const ext=f.name.split('.').pop().toLowerCase();
  if(!['dwg','dxf','pdf'].includes(ext)||f.size>25*1024*1024||!f.size){status('Escolha um arquivo PDF, DXF ou DWG de até 25 MiB.');return;}
  arquivo=f;trabalho.marcar('desenho');el('formato').disabled=ext!=='pdf';el('formato').value=ext==='dxf'?'dwg':'dxf';
  el('formato').options[1].textContent=ext==='pdf'?'DWG 2013 (2D)':'DWG 2000 (2D)';
  if(ext!=='pdf'){status('Desenho pronto para conversão.');atualizar();return;}
  el('pdf').hidden=false;el('folha').value=1;el('escala').value=1;status('Abrindo PDF…');
  try{
    const lib=await import('./vendor-cad/pdf.mjs'),bytes=new Uint8Array(await f.arrayBuffer());if(turno!==versao)return;
    const base=new URL('./vendor-cad/',import.meta.url).href;lib.GlobalWorkerOptions.workerSrc=base+'pdf.worker.mjs';
    carregamento=lib.getDocument({data:bytes,isEvalSupported:false,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',cMapUrl:base+'cmaps/',cMapPacked:true});
    const d=await carregamento.promise;if(turno!==versao)return;
    documento=d;el('folha').max=d.numPages;await conferir();
  }catch(e){if(turno===versao)erro(e);}
};
el('ver').onclick=conferir;el('folha').oninput=()=>{if(documento){++versao;parar();limparPagina();trabalho.marcar('desenho');status('Clique em Conferir página.');}};
el('escala').oninput=()=>{encerrarCalibracao();++versao;parar();baixarLimpo();trabalho.marcar('calibracao');trabalho.marcar('desenho');atualizar();};el('formato').onchange=()=>{encerrarCalibracao();++versao;parar();baixarLimpo();trabalho.marcar('desenho');atualizar();};el('marcas').onchange=()=>{el('sobre').hidden=!el('marcas').checked;};
el('calibrar').onclick=()=>{
  const medida=el('conhecida').valueAsNumber;
  if(!pagina||!Number.isFinite(medida)||medida<=0){el('passo').textContent='Confira a página e informe uma cota real positiva.';return;}
  parar();baixarLimpo();referencia={medida};el('gerar').disabled=true;el('original').style.cursor='crosshair';
  trabalho.marcar('calibracao');
  trabalho.marcar('desenho');
  el('passo').textContent='Marque a primeira extremidade da cota no desenho.';
};
el('original').onclick=e=>{
  if(!referencia||!pagina)return;
  const dom=el('original').getBoundingClientRect(),p=[(e.clientX-dom.left)*pagina.largura/dom.width,(e.clientY-dom.top)*pagina.altura/dom.height];
  if(!referencia.a){referencia.a=p;el('passo').textContent='Marque a segunda extremidade da mesma cota.';return;}
  const distancia=Math.hypot(referencia.a[0]-p[0],referencia.a[1]-p[1]),escala=referencia.medida/distancia;
  if(distancia<=0||!Number.isFinite(escala)||escala<1e-6||escala>1e6){el('passo').textContent='Marque uma extremidade distinta e mais afastada.';return;}
  el('escala').value=Number(escala.toPrecision(9));encerrarCalibracao();atualizar();
  el('passo').textContent='Escala calculada. Confira uma segunda cota antes de usar o CAD.';
};
el('conhecida').oninput=()=>{encerrarCalibracao();atualizar();};
el('cancelar').onclick=()=>{++versao;parar();atualizar();status('Conversão cancelada.');};
el('gerar').onclick=async()=>{
  if(!arquivo||worker)return;
  const turno=++versao,formato=el('formato').value;
  baixarLimpo();trabalho.marcar('processamento:cad');worker=new Worker(new URL('./cad-worker.mjs',import.meta.url),{type:'module'});el('cancelar').hidden=false;atualizar();status('Convertendo desenho…');
  function falhar(e){if(turno!==versao)return;parar();atualizar();erro(e);}
  tempo=setTimeout(()=>falhar(new Error('O desenho excedeu 90 segundos de processamento.')),90000);
  worker.onerror=()=>falhar(new Error('Falha ao converter o desenho no navegador.'));
  worker.onmessage=({data})=>{
    if(turno!==versao)return;parar();atualizar();if(data.erro){erro(new Error(data.erro));return;}
    const nome=arquivo.name.replace(/\.[^.]+$/,'')+(pagina?'-p'+folhaPronta:'')+'.'+formato;
    resultado={nome,bytes:data.bytes,formato};const a=el('cadsaida');a.removeAttribute('href');a.textContent='Baixar '+nome;a.hidden=false;
    trabalho.concluir('calibracao');
    trabalho.marcar('desenho');
    status(['Desenho convertido.',...(pagina?.avisos||[]),...data.avisos].join('\n'));
  };
  try{
    if(pagina)worker.postMessage({formato,pagina:{entidades:pagina.entidades},fator:el('escala').valueAsNumber});
    else {const bytes=await arquivo.arrayBuffer();if(turno===versao)worker.postMessage({formato,bytes},[bytes]);}
  }catch(e){falhar(e);}
};
el('cadsaida').addEventListener('click',async e=>{e.preventDefault();if(!resultado)return;const saida=resultado;const entregue=await exportToolResult({toolId:'bim-cad',format:saida.formato,content:new Blob([saida.bytes],{type:'application/octet-stream'}),deliver:()=>{const url=URL.createObjectURL(new Blob([saida.bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=saida.nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});if(entregue)trabalho.confirmarSalvamento('desenho',e.currentTarget);});
