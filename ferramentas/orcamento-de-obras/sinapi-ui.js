import { ufs, regimes, tipos, lerCSV, lerItensCSV } from './sinapi-base.js';

const normalizar = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const chaves = ['codigo','descricao','unidade','preco'];
const titulos = ['Código','Descrição','Unidade','Preço unitário'];

export function montarImportador(container, aoSelecionar) {
  container.innerHTML = `<p>Abra o XLSX de referências extraído do ZIP mensal da <a href="https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx">CAIXA</a> ou use sua tabela CSV. O arquivo fica no navegador.</p>
    <label>Origem da tabela<select data-c="formato"><option value="xlsx">SINAPI nacional em XLSX</option><option value="csv">Base própria ou recorte em CSV</option></select></label>
    <div class="orc-dados"><label>UF<select data-c="uf"><option value="">Selecione</option></select></label>
    <label data-c="tipo-label">Relatório<select data-c="tipo"></select></label><label>Regime de encargos<select data-c="regime"></select></label></div>
    <div data-c="csv-params" hidden><p>Use a primeira linha como cabeçalho. A tabela deve corresponder a uma única UF e competência. <a href="modelo-base.csv" download>Baixar modelo CSV ilustrativo</a>.</p>
    <div class="orc-dados"><label>Nome da base<input data-c="base" placeholder="Ex.: Cotação local" maxlength="55"></label>
    <label>Mês de referência<input type="month" data-c="competencia"></label>
    <label>Separador decimal dos preços<select data-c="decimal"><option value="br">Vírgula (1.234,56)</option><option value="decimal">Ponto (1234.56, sem milhares)</option></select></label></div></div>
    <label>Arquivo de preços<input type="file" data-c="arquivo" data-leitura-local accept=".xlsx"></label>
    <div class="orc-dados" data-c="mapa" hidden></div>
    <button data-c="ler" type="button" class="button button-secondary">Carregar referências</button>
    <p data-c="aviso" role="status" aria-live="polite"></p>
    <div data-c="catalogo" hidden><label>Buscar por código ou descrição<input type="search" data-c="busca" placeholder="Ex.: piso, concreto ou código"></label>
    <label>Referências encontradas<select data-c="itens"></select></label>
    <p data-c="detalhe"></p><button type="button" data-c="usar" class="button button-secondary">Usar no serviço</button></div>`;
  const get = key => container.querySelector('[data-c="'+key+'"]');
  const option = (s,value,label) => s.add(new Option(label,value));
  ufs.forEach(uf=>option(get('uf'),uf,uf));
  Object.entries(regimes).forEach(([k,v])=>option(get('regime'),k,v));
  Object.entries(tipos).forEach(([k,v])=>option(get('tipo'),k,v));
  get('tipo').value='C';
  const mapSelects=chaves.map((key,i)=>{
    const label=document.createElement('label');label.textContent=titulos[i];
    const select=document.createElement('select');label.append(select);get('mapa').append(label);
    return select;
  });
  const isCsv=()=>get('formato').value==='csv';
  let tabela=null,itens=[],job=null,ticket=0;
  function limpar() {
    ticket++;
    if(job){job.terminate();job=null;}
    itens=[];get('catalogo').hidden=true;get('ler').disabled=false;
    get('aviso').textContent='';
  }
  function mostrarDetalhe() {
    const item=itens[Number(get('itens').value)];
    const valid=Boolean(get('itens').selectedOptions.length && item);
    const unavailable=!valid || item.preco===null;
    get('usar').disabled=unavailable;
    get('detalhe').textContent=!valid?'Nenhuma referência encontrada.':[
      item.codigo,item.descricao,item.unidade,unavailable?'Sem preço disponível para esta referência':
      Number(item.preco)===0?'Preço informado na tabela: R$ 0,00. Confira a origem antes de usar.':
      Number(item.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:4}),item.fonte
    ].join(' · ');
  }
  function buscar() {
    const term=normalizar(get('busca').value.trim()),select=get('itens');
    select.replaceChildren();
    for(let i=0;i<itens.length && select.options.length<40;i++){
      const item=itens[i];
      if(normalizar(item.codigo+' '+item.descricao).includes(term)) option(select,String(i),item.codigo+' · '+item.descricao);
    }
    mostrarDetalhe();
  }
  function publicar(r) {
    itens=r.itens;
    get('catalogo').hidden=false;get('busca').value='';
    const missing=itens.filter(x=>x.preco===null).length;
    get('aviso').textContent=r.fonte+'. '+itens.length.toLocaleString('pt-BR')+' referências, '+missing.toLocaleString('pt-BR')+' sem preço utilizável. A busca exibe até 40 resultados por vez.';
    buscar();
  }
  async function mapaCSV(file) {
    tabela=null;
    if(!isCsv() || !file) return;
    const current=ticket;
    if(file.size>12_000_000) throw Error('O CSV excede 12 MB.');
    const bytes=await file.arrayBuffer();if(current!==ticket)return;
    let texto;
    try{texto=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{texto=new TextDecoder('windows-1252').decode(bytes);}
    tabela=lerCSV(texto);
    mapSelects.forEach((sel,i)=>{
      sel.replaceChildren();option(sel,'','Selecione a coluna');
      tabela.cabecalho.forEach((v,j)=>option(sel,String(j),(j+1)+'. '+String(v).slice(0,100)));
      const aliases=[['codigo','codigo do insumo','codigo da composicao'],['descricao','descricao do insumo'],['unidade','un','und'],['preco','preco unitario','custo','custo unitario']];
      const index=tabela.cabecalho.findIndex(v=>aliases[i].includes(normalizar(v.trim())));
      if(index>=0)sel.value=String(index);
    });
    get('mapa').hidden=false;
  }
  get('formato').addEventListener('change',()=>{
    limpar();tabela=null;get('arquivo').value='';get('arquivo').accept=isCsv()?'.csv,.tsv,.txt':'.xlsx';
    get('csv-params').hidden=!isCsv();get('tipo-label').hidden=isCsv();get('mapa').hidden=true;
    const s=get('regime');s.querySelector('[value="na"]')?.remove();
    if(isCsv())option(s,'na','Não se aplica à cotação');
  });
  get('arquivo').addEventListener('change',async()=>{
    limpar();tabela=null;get('mapa').hidden=true;
    try{await mapaCSV(get('arquivo').files[0]);}catch(e){get('aviso').textContent=e.message;}
  });
  for(const el of [get('uf'),get('tipo'),get('regime'),get('base'),get('competencia'),get('decimal'),...mapSelects]) {
    el.addEventListener('input',limpar);
  }
  get('busca').addEventListener('input',buscar);get('itens').addEventListener('change',mostrarDetalhe);
  get('usar').addEventListener('click',()=>{
    const item=itens[Number(get('itens').value)];
    if(item && item.preco!==null && get('itens').selectedOptions.length)aoSelecionar({...item});
  });
  get('ler').addEventListener('click',async()=>{
    limpar();const current=ticket;
    const uf=get('uf').value,regime=get('regime').value;
    try{
      const file=get('arquivo').files[0];if(!file || !uf)throw Error('Selecione a UF e o arquivo de preços.');
      if(isCsv()){
        if(!tabela){await mapaCSV(file);if(current!==ticket)return;}
        if(!tabela)throw Error('O CSV ainda não está disponível.');
        const cols=Object.fromEntries(chaves.map((k,i)=>[k,mapSelects[i].value===''?-1:Number(mapSelects[i].value)]));
        publicar(lerItensCSV(tabela,cols,{base:get('base').value,uf,competencia:get('competencia').value,regime:regimes[regime] || 'Não se aplica',formato:get('decimal').value}));
      } else {
        if(!/\.xlsx$/i.test(file.name) || file.size>32_000_000)throw Error('Escolha o XLSX de referências, descompactado, com até 32 MB.');
        get('ler').disabled=true;get('aviso').textContent='Lendo a aba da UF e do regime selecionados…';
        const buffer=await file.arrayBuffer();if(current!==ticket)return;
        job=new Worker(new URL('./sinapi-worker.js',import.meta.url),{type:'module'});
        const finish=()=>{job?.terminate();job=null;get('ler').disabled=false;};
        job.onmessage=({data})=>{if(current!==ticket)return;finish();if(data.erro)get('aviso').textContent=data.erro;else publicar(data);};
        job.onerror=()=>{if(current!==ticket)return;finish();get('aviso').textContent='Não foi possível ler o XLSX. Confira o arquivo ou use um recorte CSV.';};
        job.postMessage({buffer,uf,tipo:get('tipo').value,regime},[buffer]);
      }
    } catch(e){if(current===ticket){get('ler').disabled=false;get('aviso').textContent=e.message;}}
  });
}
