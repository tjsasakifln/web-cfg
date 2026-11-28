// PDF.js 6.2 packed operators. Geometry is kept in paper millimetres until export.
import {caixa,cortar,igual,poligonos,regiao,retangulo,sobrepoe,sub} from './cad-pdf-regioes.mjs';
import {configurarTexto,converterTexto,inversa,matriz,ponto,textoInicial} from './cad-pdf-texto.mjs';
export {matriz} from './cad-pdf-texto.mjs';

const PT_MM=25.4/72, LIMITE=80000;
const ident=[1,0,0,1,0,0];
const meio=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
function caminhos(packed,m,debitar){
  let atual=null,inicio=null,vertices=0;const contornos=[];
  function contar(){
    debitar(1);
    if(++vertices>LIMITE)throw new Error('Um caminho supera 80 mil pontos vetoriais. Divida a folha em vistas menores.');
  }
  function linha(p){
    if(!atual)throw new Error('Caminho vetorial inválido.');
    contar();
    if(!igual(atual.at(-1),p))atual.push(p);
  }
  function distancia(p,a,b){
    const d=sub(b,a),l=d[0]**2+d[1]**2;
    const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l)):0;
    return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);
  }
  function curva(a,b,c,d,n){
    if(n>=16||Math.max(distancia(b,a,d),distancia(c,a,d))<=0.025){linha(d);return;}
    const ab=meio(a,b),bc=meio(b,c),cd=meio(c,d),u=meio(ab,bc),v=meio(bc,cd),w=meio(u,v);
    curva(a,ab,u,w,n+1);curva(w,v,cd,d,n+1);
  }
  let i=0;
  function ler(){
    if(i+1>=packed.length)throw new Error('Vetor incompleto no PDF.');
    const p=ponto(m,packed[i++],packed[i++]);
    if(!p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e8))throw new Error('Coordenada fora do limite no PDF.');
    return p;
  }
  while(i<packed.length){
    const op=packed[i++];
    if(op===0){contar();inicio=ler();atual=[inicio];contornos.push(atual);}
    else if(op===1)linha(ler());
    else if(op===2&&atual)curva(atual.at(-1),ler(),ler(),ler(),0);
    else if(op===3&&atual){
      const a=atual.at(-1),b=ler(),c=ler();
      curva(a,[(a[0]+2*b[0])/3,(a[1]+2*b[1])/3],[(c[0]+2*b[0])/3,(c[1]+2*b[1])/3],c,0);
    }else if(op===4&&inicio)linha(inicio);
    else throw new Error('Comando de desenho não reconhecido no PDF.');
  }
  return contornos;
}
function tracejar(paths,s,emitir,debitar,avisar){
  let [pattern,offset]=s.dash;
  if(pattern?.length%2)pattern=[...pattern,...pattern];
  const ciclo=pattern?.reduce((a,b)=>a+b,0),inv=ciclo>0&&inversa(s.m);
  for(const path of paths){
    let n=0,falta=pattern?.[0];
    function avancar(){n=(n+1)%pattern.length;falta=pattern[n];}
    if(inv){
      let p=((offset%ciclo)+ciclo)%ciclo;
      while(p>0&&p>=falta){p-=falta;avancar();}
      falta-=p;
    }
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      if(!inv){emitir(a,b);continue;}
      const v=sub(b,a),d=Math.hypot(inv[0]*v[0]+inv[2]*v[1],inv[1]*v[0]+inv[3]*v[1]);
      const p=k=>[a[0]+v[0]*k/d,a[1]+v[1]*k/d];
      let pos=0;
      while(pos<d-1e-9){
        debitar(1);
        if(falta<=1e-10){
          if(pattern[n]===0&&n%2===0)avisar('Alguns pontos do tracejado podem não aparecer no CAD.');
          avancar();continue;
        }
        const len=Math.min(falta,d-pos);
        if(n%2===0)emitir(p(pos),p(pos+len));
        falta-=len;pos+=len;
      }
    }
  }
}
const bounds=(m,bb)=>retangulo(...bb).map(p=>ponto(m,...p));
function estado(m,clip,cor='#000000'){
  return {m,base:m,clip,stroke:cor,fill:cor,strokeAlpha:1,fillAlpha:1,dash:[[],0],t:textoInicial(),mascara:false};
}

export function extrairPagina(operadores,o,vista,{usarFonte=()=>null,conteudoVisivel=()=>true}={}){
  const largura=vista.width*PT_MM,altura=vista.height*PT_MM;
  const base=matriz([PT_MM,0,0,-PT_MM,0,altura],vista.transform);
  if(![largura,altura,...base].every(Number.isFinite)||largura<=0||altura<=0||Math.max(largura,altura)>1e8)
    throw new Error('Dimensões inválidas para a página do PDF.');
  const avisos=new Set(), entidades=[], linhas=[], preenchimentos=[],textos=[];
  let total=0,operacoes=0;
  function avisar(m){avisos.add(m);}
  function debitar(n){if((operacoes+=n)>6e6)throw new Error('A folha tem recortes ou hachuras demais para converter de uma vez. Divida a folha em vistas menores.');}
  function emitir(alvo,tipo,dado){
    total+=tipo==='hachura'?dado.aneis.reduce((n,a)=>n+a.length,0):1;
    if(total>LIMITE)throw new Error('A folha supera 80 mil detalhes vetoriais. Divida a folha em vistas menores.');
    alvo.push({tipo,...dado});
  }
  const raster=new Set([o.paintImageXObject,o.paintInlineImageXObject,o.paintImageMaskXObject,o.paintImageXObjectRepeat,
    o.paintImageMaskXObjectRepeat,o.paintImageMaskXObjectGroup,o.paintInlineImageXObjectGroup,o.paintSolidColorImageMask].filter(Number.isInteger));
  const fillOps=new Set([o.fill,o.eoFill,o.fillStroke,o.eoFillStroke,o.closeFillStroke,o.closeEOFillStroke]);
  const eoOps=new Set([o.eoFill,o.eoFillStroke,o.closeEOFillStroke]);
  const strokeOps=new Set([o.stroke,o.closeStroke,o.fillStroke,o.eoFillStroke,o.closeFillStroke,o.closeEOFillStroke]);
  const closeOps=new Set([o.closeStroke,o.closeFillStroke,o.closeEOFillStroke]);

  function converter(lista,s,alvo,prof=0){
    if(prof>1)throw new Error('Padrões encadeados não são compatíveis.');
    const pilha=[],marcas=[];
    let recorte=null,anotacao=0;
    function salvar(){if(pilha.length>=256)throw new Error('Limite de estados gráficos do PDF excedido.');pilha.push(s);s={...s,t:{...s.t}};}
    function restaurar(){if(!pilha.length)throw new Error('Pilha gráfica inválida.');s=pilha.pop();}
    function clip(loops,eo=false){s.clip=poligonos(loops,s.clip,eo,debitar);}
    const linha=(a,b,r,c)=>{for(const [p,q] of cortar(a,b,r,debitar))emitir(alvo,'linha',{a:p,b:q,rgb:c});};
    const preencher=(r,c)=>{for(const aneis of r.grupos)emitir(alvo,'hachura',{aneis,rgb:c});};
    function color(ir){
      if(ir[0]!=='TilingPattern')return {ir:null};
      return {ir,base:s.base};
    }
    function ladrilhar({ir,base},reg){
      if(!ir||prof){avisar('Gradientes ou hachuras com padrões compostos não foram reproduzidos.');return false;}
      const [,color,ops,m,bb,dx,dy]=ir, sx=Math.abs(dx),sy=Math.abs(dy);
      const mt=matriz(base,m||ident), inv=inversa(mt);
      if(!inv||!bb?.every(Number.isFinite)||!(sx>0&&sy>0)||!ops?.fnArray){
        avisar('Uma hachura usa um padrão que não pôde ser reproduzido.');return false;
      }
      const [x0,y0,x1,y1]=bb;
      const tile=[];
      const cell=regiao([[retangulo(x0,y0,x1,y1)]]);
      converter(ops,estado(ident,cell,typeof color==='string'?color:'#000000'),tile,prof+1);
      if(!tile.length){avisar('Uma hachura não pôde ser reproduzida e foi reduzida ao contorno.');return false;}
      const [l,b,r,t]=caixa(bounds(inv,reg.limites));
      const nx=Math.floor((l-x1)/sx),mx=Math.ceil((r-x0)/sx),
        ny=Math.floor((b-y1)/sy),my=Math.ceil((t-y0)/sy);
      const custo=(mx-nx+1)*(my-ny+1)*tile.length;
      if(!Number.isSafeInteger(custo)||![nx,mx,ny,my].every(Number.isSafeInteger)||custo>200000)
        throw new Error('Uma hachura é densa demais para converter inteira. Divida a folha em vistas menores.');
      debitar(custo);
      let omitiu=false;
      for(let x=nx;x<=mx;x++)for(let y=ny;y<=my;y++){
        const fn=([a,b])=>ponto(mt,a+x*sx,b+y*sy);
        if(!sobrepoe(caixa(retangulo(...bb).map(fn)),reg.limites))continue;
        for(const e of tile){
          if(e.tipo==='linha')linha(fn(e.a),fn(e.b),reg,e.rgb);
          else if(e.tipo==='hachura')preencher(poligonos(e.aneis.map(a=>a.map(fn)),reg,false,debitar),e.rgb);
          else omitiu=true;
        }
      }
      if(omitiu)avisar('Textos usados dentro de um padrão de hachura não foram reproduzidos.');
      return true;
    }
    for(let i=0;i<lista.fnArray.length;i++){
      debitar(1);
      const op=lista.fnArray[i],a=lista.argsArray[i]||[];
      if(op===o.beginAnnotation){anotacao++;avisar('Comentários e anotações sobrepostos ao PDF não entram no CAD.');continue;}
      if(op===o.endAnnotation){anotacao--;continue;}
      if(anotacao)continue;
      if(op===o.beginMarkedContent||op===o.beginMarkedContentProps){
        marcas.push((marcas.at(-1)??true)&&(a[0]!=='OC'||a.length<2||conteudoVisivel(a[1])));continue;
      }
      if(op===o.endMarkedContent){marcas.pop();continue;}
      // Hidden optional content can still execute ordinary q/Q and transform operators.
      const mostrar=(marcas.at(-1)??true)&&!s.mascara;
      if(op===o.save||op===o.paintFormXObjectBegin||op===o.beginGroup){
        salvar();
        if(op===o.paintFormXObjectBegin){
          if(a[0])s.m=matriz(s.m,a[0]);
          s.base=s.m;
          if(a[1])clip([bounds(s.m,a[1])]);
        }else if(op===o.beginGroup){
          const g=a[0];
          if(g?.bbox)clip([bounds(g.matrix?matriz(s.m,g.matrix):s.m,g.bbox)]);
          if(g?.smask){if(mostrar)avisar('Máscaras de suavização e efeitos de transparência não foram reproduzidos.');s.mascara=true;}
          else if(mostrar&&(g?.needsIsolation||g?.knockout||g?.isGray))
            avisar('A composição de transparências e cores pode diferir do PDF.');
        }
      }else if(op===o.restore||op===o.paintFormXObjectEnd||op===o.endGroup){restaurar();}
      else if(op===o.transform)s.m=matriz(s.m,a);
      else if(op===o.clip||op===o.eoClip)recorte=op===o.eoClip;
      else if(op===o.setStrokeRGBColor)s.stroke=a[0];
      else if(op===o.setFillRGBColor)s.fill=a[0];
      else if(op===o.setStrokeTransparent)s.stroke='transparent';
      else if(op===o.setFillTransparent)s.fill='transparent';
      else if(op===o.setStrokeColorN)s.stroke=color(a);
      else if(op===o.setFillColorN)s.fill=color(a);
      else if(op===o.setDash)s.dash=a;
      else if(op===o.setGState){
        for(const [k,v] of a[0]||[]){
          if(k==='ca')s.fillAlpha=v;
          else if(k==='CA')s.strokeAlpha=v;
          else if(k==='D')s.dash=v;
          else if(k==='Font')configurarTexto(s.t,o.setFont,v,o);
          else if(mostrar&&(k==='SMask'&&v||k==='BM'&&v!=='source-over'))
            avisar('A composição de transparências e cores pode diferir do PDF.');
        }
      }else if(op===o.constructPath){
        const paint=a[0],packed=a[1]?.[0];
        if(packed&&!ArrayBuffer.isView(packed)&&!Array.isArray(packed))
          throw new Error('A folha precisa ser lida antes de montar sua prévia.');
        if(!mostrar&&recorte===null)continue;
        const paths=caminhos(packed||[],s.m,debitar);
        if(closeOps.has(paint)&&paths.at(-1)?.length>1&&!igual(paths.at(-1)[0],paths.at(-1).at(-1)))paths.at(-1).push(paths.at(-1)[0]);
        if(mostrar&&fillOps.has(paint)&&s.fillAlpha>0&&s.fill!=='transparent'){
          if(s.fillAlpha<1)avisar('Preenchimentos semitransparentes foram gravados sem transparência.');
          const r=poligonos(paths,s.clip,eoOps.has(paint),debitar);
          if(r.ciclos.length&&typeof s.fill==='object'){
            if(!ladrilhar(s.fill,r))for(const anel of r.ciclos)for(let k=0;k<anel.length;k++)linha(anel[k],anel[(k+1)%anel.length],s.clip,'#000000');
          }else preencher(r,s.fill);
        }
        if(mostrar&&strokeOps.has(paint)&&s.strokeAlpha>0&&s.stroke!=='transparent'){
          if(typeof s.stroke==='object')avisar('Traços com preenchimento de padrão foram gravados como linhas simples.');
          if(s.strokeAlpha<1)avisar('Traços semitransparentes foram gravados sem transparência.');
          tracejar(paths,s,(p,q)=>linha(p,q,s.clip,s.stroke),debitar,avisar);
        }
        if(recorte!==null){clip(paths,recorte);recorte=null;}
      }else if(op===o.showText){
        converterTexto(a[0],mostrar?s:{...s,fillAlpha:0,strokeAlpha:0},usarFonte,
          t=>emitir(alvo,'texto',t),avisar,debitar);
      }else if(mostrar&&raster.has(op))avisar('Imagens não entram no CAD vetorial. Use a ferramenta de digitalização para recuperar seus contornos.');
      else if(mostrar&&op===o.shadingFill)avisar('Gradientes do PDF não foram convertidos em vetores.');
      else configurarTexto(s.t,op,a,o);
    }
    if(pilha.length||recorte!==null)throw new Error('Página com operações gráficas incompletas.');
  }
  converter(operadores,estado(base,regiao([[retangulo(0,0,largura,altura)]])),entidades);
  for(const e of entidades){
    if(e.tipo==='linha')linhas.push([e.a,e.b]);
    else if(e.tipo==='hachura')preenchimentos.push(e.aneis);
    else textos.push(e);
  }
  return {largura,altura,entidades,linhas,preenchimentos,textos,avisos:[...avisos]};
}
