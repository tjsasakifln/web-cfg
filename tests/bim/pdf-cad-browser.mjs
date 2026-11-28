import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {setTimeout as delay} from 'node:timers/promises';
import {serveCad} from '../cad/server.mjs';
import {pdfCadFixture} from './pdf-cad-fixture.mjs';

const MM=25.4/72;
const perto=(a,b,tolerancia=0.001)=>Math.abs(a-b)<tolerancia;
export async function conferirPdfCad(browser,base){
  const tmp=await mkdtemp(join(tmpdir(),'pdf-cad-'));
  assert.equal(new URL(base).hostname,'127.0.0.1','Os testes de exportação usam apenas um servidor local.');
  const page=await browser.newPage(), erros=[], assets=[];
  const cdp=await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:tmp});
  await page.setRequestInterception(true);
  page.on('request',r=>{
    const config=r.url()===base+'/api/web/tool-credits?op=config';
    void (config?r.respond({status:200,contentType:'application/json',body:'{"enabled":false}'}):r.continue());
  });
  page.on('pageerror',e=>erros.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base+'/bim/')&&r.status()>=400)assets.push(r.url());});
  try{
    const f=join(tmp,'prancha.pdf');
    await writeFile(f,pdfCadFixture());
    const resposta=await page.goto(base+'/bim/web/cad.html',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(resposta.status(),200);
    await page.waitForFunction(()=>typeof document.querySelector('#arquivo')?.onchange==='function',{timeout:10000});
    await (await page.$('#arquivo')).uploadFile(f);
    async function diagnosticar(flag){
      await page.waitForFunction(flag,{timeout:25000}).catch(async e=>{
        throw new Error((await page.$eval('#mensagem',n=>n.textContent))+' | '+erros.join(' | '),{cause:e});
      });
    }
    await diagnosticar(()=>!document.querySelector('#gerar').disabled);
    assert.match(await page.$eval('#mensagem',n=>n.textContent),/4 textos e 2 preenchimentos na página 1/);
    async function converter(formato,folha){
      await page.select('#formato',formato);
      if(formato==='dwg')assert.match(await page.$eval('#formato',n=>n.selectedOptions[0].textContent),/2013/);
      await page.click('#gerar');
      await diagnosticar(()=>!document.querySelector('#cadsaida').hidden||!document.querySelector('#gerar').disabled);
      const estado=await page.$eval('#mensagem',n=>n.textContent);
      assert.equal(await page.$eval('#cadsaida',a=>a.hidden),false,estado);
      await page.click('#cadsaida');
      const nome=join(tmp,`prancha-p${folha}.${formato}`);
      let arquivo;
      for(let i=0;i<100&&!arquivo;i++){
        try{arquivo=await readFile(nome);}catch(e){if(e.code!=='ENOENT')throw e;await delay(75);}
      }
      assert(arquivo?.length, 'O download não gerou '+nome);
      return page.evaluate(async({formato,dados})=>{
        const bytes=new Uint8Array(dados);
        const lib=await import('/bim/web/vendor-cad/acad.mjs');
        const doc=formato==='dwg'?lib.DwgReader.readFromStream(bytes.buffer):lib.DxfReader.readFromStream(bytes);
        const xy=p=>[p.x,p.y];
        const linhas=[],textos=[],hachuras=[];
        for(const e of doc.modelSpace.entities){
          if(e.objectName==='TEXT')textos.push([e.value,xy(e.insertPoint),e.rotation]);
          else if(e.objectName==='LINE')linhas.push([xy(e.startPoint),xy(e.endPoint),e.color.trueColor]);
          else if(e.objectName==='HATCH')hachuras.push({solida:e.isSolid,
            loops:e.paths.map(p=>p.edges[0].vertices.map(xy)),rgb:e.color.trueColor});
          else throw new Error('Entidade inesperada: '+e.objectName);
        }
        return {unidade:doc.header.insUnits,versao:doc.header.version,assinatura:new TextDecoder().decode(bytes.subarray(0,6)),
          linhas,textos,hachuras,estado:document.querySelector('#mensagem').textContent};
      },{formato,dados:[...arquivo]});
    }
    for(const formato of ['dwg','dxf']){
      const d=await converter(formato,1);
      assert.equal(d.unidade,4);
      if(formato==='dwg')assert.equal(d.assinatura,'AC1027');
      assert.match(d.estado,/Desenho convertido/);
      assert.doesNotMatch(d.estado,/pontos do tracejado|não foram reproduzidos/);
      assert.deepEqual(d.textos.map(t=>t[0]),['Área Ø12 ±','VISIVEL','FORMA','∅₁Δ']);
      assert(perto(d.textos[0][1][0],11*MM)&&perto(d.textos[0][1][1],181*MM));
      assert(perto(d.textos[2][2],Math.PI/2));
      assert.deepEqual(d.hachuras.map(h=>h.loops.map(l=>l.length)),[[4,4],[3]]);
      assert(d.hachuras.every(h=>h.solida));
      assert.equal(d.hachuras[0].rgb,0x336699);
      assert(d.linhas.length>55);
      assert(!d.linhas.some(([a,b])=>perto(a[1],170*MM)&&perto(b[1],170*MM)));
      const dash=d.linhas.filter(([a,b])=>perto(a[1],15*MM)&&perto(b[1],15*MM));
      assert.equal(dash.length,14);
      assert(dash.every(([a,b])=>perto(b[0]-a[0],4*MM)));
      const nest=d.linhas.filter(([a,b])=>Math.min(a[1],b[1])>=35*MM-.001&&Math.max(a[0],b[0])<=85*MM+.001);
      assert(nest.length>=40);
      assert(nest.every(([a,b])=>{
        const x=(a[0]+b[0])/(2*MM),y=(a[1]+b[1])/(2*MM);
        return !(x>30+.001&&x<40-.001&&y>45+.001&&y<55-.001);
      }));
      assert(d.linhas.some(([, ,rgb])=>rgb===0x008000||rgb===0x007f00),'padrão não colorido perdeu a cor do preenchimento');
    }
    await page.$eval('#folha',n=>{n.value=2;n.dispatchEvent(new Event('input'));});
    await page.click('#ver');
    await diagnosticar(()=>!document.querySelector('#gerar').disabled);
    await page.$eval('#escala',n=>{n.value=25;n.dispatchEvent(new Event('input'));});
    const rot=await converter('dwg',2);
    assert.deepEqual(rot.textos.map(t=>t[0]),['FOLHA DOIS']);
    assert.equal(rot.linhas.length,1);
    const [a,b]=rot.linhas[0];
    assert(perto(Math.hypot(a[0]-b[0],a[1]-b[1]),100*2*MM*25));
    assert(perto(a[0],b[0]));
    assert.deepEqual(erros,[]);
    assert.deepEqual(assets,[]);
    console.log('PASS PDF→CAD: 2 folhas, Unicode, Form, camadas ocultas, recortes, tracejados, padrões, hachura vazada, DXF, DWG 2013 e escala');
  }finally{await page.close();await rm(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===import.meta.filename){
  const server=await serveCad(process.argv[2]||'_site');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{await conferirPdfCad(browser,server.base);}
  finally{await browser.close();await new Promise(ok=>server.server.close(ok));}
}
