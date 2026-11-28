import {dentro} from './cad-pdf-regioes.mjs';

const identidade=[1,0,0,1,0,0];
export const ponto=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function matriz(a,b){
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function inversa(m){
  const [a,b,c,d,x,y]=m,det=a*d-b*c;
  return det&&Number.isFinite(det)?[d/det,-b/det,-c/det,a/det,(c*y-d*x)/det,(b*x-a*y)/det]:null;
}
export const textoInicial=()=>({tm:identidade,x:0,y:0,lx:0,ly:0,fonte:null,tamanho:0,
  h:1,entre:0,entrePalavras:0,entreLinhas:0,eleva:0,modo:0});
export function configurarTexto(t,op,a,o){
  const mover=(x,y)=>{t.x=t.lx+=x;t.y=t.ly+=y;};
  if(op===o.beginText||op===o.setTextMatrix){
    t.tm=op===o.beginText?identidade:a[0];t.x=t.y=t.lx=t.ly=0;
  }else if(op===o.setFont){t.fonte=a[0];t.tamanho=a[1];}
  else if(op===o.setCharSpacing)t.entre=a[0];
  else if(op===o.setWordSpacing)t.entrePalavras=a[0];
  else if(op===o.setHScale)t.h=a[0]/100;
  else if(op===o.setTextRise)t.eleva=a[0];
  else if(op===o.setLeading)t.entreLinhas=-a[0];
  else if(op===o.setTextRenderingMode)t.modo=a[0];
  else if(op===o.moveText||op===o.setLeadingMoveText){
    if(op===o.setLeadingMoveText)t.entreLinhas=a[1];
    mover(...a);
  }else if(op===o.nextLine)mover(0,t.entreLinhas);
}
export function converterTexto(glifos,s,usarFonte,emitir,avisar,debitar){
  const t=s.t,fs=Math.abs(t.tamanho),sinal=Math.sign(t.tamanho),escX=t.h*sinal;
  if(!fs||!escX||!glifos?.length||!t.tm?.every(Number.isFinite))return;
  debitar(glifos.length);
  const f=usarFonte(t.fonte),vertical=!!f?.vertical, avanco=fs*(f?.fontMatrix?.[0]||0.001);
  const tm=matriz(s.m,t.tm),emX=Math.hypot(tm[0],tm[1]),emY=Math.hypot(tm[2],tm[3]);
  if(!emX||!emY||!tm.every(Number.isFinite))return;
  const rotacao=Math.atan2(tm[1],tm[0]),cap=fs*.72,altura=cap*emY;
  const distorcido=Math.abs((tm[0]*tm[2]+tm[1]*tm[3])/(emX*emY))>0.01;
  const invertido=(tm[0]*tm[3]-tm[1]*tm[2])*sinal<0, espelhado=escX<0;
  const modo=t.modo&3;
  const fill=modo!==1&&modo!==3&&s.fillAlpha>0&&s.fill!=='transparent';
  const stroke=modo!==0&&modo!==3&&s.strokeAlpha>0&&s.stroke!=='transparent';
  const rgb=fill?s.fill:s.stroke;
  const visivel=fill||stroke;
  const largura=Math.max(.01,Math.min(100,Math.abs(escX)*emX/emY));
  if(t.modo&4)avisar('Recortes feitos com o contorno de letras podem mudar no CAD.');
  let x=0,run=null;
  function fechar(){
    if(run?.valor.trim())emitir({origem:run.origem,altura,rotacao,largura,invertido,espelhado,valor:run.valor.trimEnd(),rgb});
    run=null;
  }
  for(const g of glifos){
    if(typeof g==='number'){
      if(Math.abs(g)>120)fechar(); // an explicit positioning gap is not a CAD space
      x+=(vertical?1:-1)*g*fs/1000;continue;
    }
    if(!g||!Number.isFinite(g.width))continue;
    const m=g.vmetric||f?.defaultVMetrics;
    const w=vertical&&m?-m[0]:g.width,dx=w*avanco;
    const e=(t.entre+(g.isSpace?t.entrePalavras:0))*sinal;
    const u=vertical?t.x-(g.vmetric?m[1]:g.width*.5)*avanco*escX:t.x+x*escX;
    const v=t.y+t.eleva-(vertical?x+(m?.[2]||0)*avanco:0);
    const pos=ponto(tm,u,v);
    if(visivel&&pos.every(Number.isFinite)&&!(f&&g.isInFont===false&&!f.missingFile&&!g.isSpace&&!/^\s+$/u.test(g.unicode||''))){
      const char=g.unicode?.replace(/[\u0000-\u001f\u007f-\u009f]/g,'');
      const passo=dx*escX, px=vertical?0:passo, py=vertical?-dx:0;
      const em=cap*sinal;
      const amostras=[[.12,.1],[.5,.5],[.88,.85],[.2,.8],[.8,.2]];
      const cobertura=amostras.filter(([h,k])=>dentro(ponto(tm,u+h*px,v+h*py+k*em),s.clip,debitar)).length;
      if(cobertura&&char&&!/^[\uE000-\uF8FF\uFFFD]+$/u.test(char)){
        if(cobertura<amostras.length)avisar('Letras cortadas na borda de um recorte podem aparecer inteiras no CAD.');
        const separado=vertical||/[\u0590-\u08ff]/u.test(char)||Math.abs(e)>fs*.16;
        if(separado||(run?.valor.length||0)+char.length>240)fechar();
        if(!run&&char.trim())run={origem:pos,valor:''};
        if(run)run.valor+=char;
        if(separado)fechar();
        if(distorcido||vertical||f?.isType3Font)avisar('Algumas fontes especiais ou deformadas foram aproximadas com texto CAD.');
      }else if(!cobertura||!char||char.trim()){
        if(cobertura&&(!char||char.trim()))avisar('Alguns caracteres não têm correspondência de texto no PDF.');
        fechar();
      }
    }else fechar();
    x+=dx+(vertical?-e:e);
  }
  fechar();
  if(vertical)t.y-=x;else t.x+=x*escX;
}
