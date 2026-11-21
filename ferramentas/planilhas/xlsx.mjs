/* Planilhas Excel editáveis: fórmulas, 5 abas e gráfico nativo OOXML. */
import {zip,xmlText} from '../orcamento-de-obras/vendor/takeoff-xlsx.js';
import {calculate,scenario,excelExpression} from './data.mjs';
const X='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/package/2006/relationships';
const C='http://schemas.openxmlformats.org/drawingml/2006/chart';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const D='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const esc=xmlText;
const col=n=>{let a=n+1,s='';while(a){a--;s=String.fromCharCode(65+a%26)+s;a=Math.floor(a/26);}return s;};
const finite=n=>{if(!Number.isFinite(n))throw Error('Valor não finito para o Excel');return String(Object.is(n,-0)?0:n);};
const style={normal:0,title:1,subtitle:2,head:3,input:4,result:5,label:6,note:7};
const S=[
'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="'+X+'">',
'<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0000;[Red](#,##0.0000)"/></numFmts>',
'<fonts count="4"><font><sz val="11"/><name val="Aptos"/></font>',
'<font><b/><sz val="19"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font>',
'<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>',
'<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF061A33"/></font></fonts>',
'<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>',
'<fill><patternFill patternType="solid"><fgColor rgb="FF061A33"/></patternFill></fill>',
'<fill><patternFill patternType="solid"><fgColor rgb="FF0A294B"/></patternFill></fill>',
'<fill><patternFill patternType="solid"><fgColor rgb="FFE8F2FF"/></patternFill></fill>',
'<fill><patternFill patternType="solid"><fgColor rgb="FFEDF5EC"/></patternFill></fill></fills>',
'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>',
'<border><left/><right/><top/><bottom style="thin"><color rgb="FFDCE3E8"/></bottom><diagonal/></border></borders>',
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
'<cellXfs count="8">',
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>',
'<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>',
'<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>',
'<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>',
'<xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>',
'<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>',
'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs>',
'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
].join('');
function cell(value,row,i){
  if(value===null||value===undefined||value==='')return '';
  const v=typeof value==='object'?value:{v:value};
  const st=style[v.s]||0, attr=' r="'+col(i)+(row+1)+'"'+(st?' s="'+st+'"':'');
  if(v.f)return '<c'+attr+'><f>'+esc(v.f)+'</f>'+(typeof v.v==='number'?'<v>'+finite(v.v)+'</v>':'')+'</c>';
  if(typeof v.v==='number')return '<c'+attr+'><v>'+finite(v.v)+'</v></c>';
  return '<c'+attr+' t="inlineStr"><is><t xml:space="preserve">'+esc(String(v.v))+'</t></is></c>';
}
function sheet(rows,widths,{freeze=0,drawing=false,merge=[]}={}){
  const views='<sheetViews><sheetView workbookViewId="0">'+(freeze?'<pane ySplit="'+freeze+'" topLeftCell="A'+(freeze+1)+'" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="'+X+'" xmlns:r="'+R+'">'+views+
    '<cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>'+
    '<sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'"'+(i===0?' ht="34" customHeight="1"':'')+'>'+r.map((v,j)=>cell(v,i,j)).join('')+'</row>').join('')+'</sheetData>'+
    (merge.length?'<mergeCells count="'+merge.length+'">'+merge.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells>':'')+
    (drawing?'<drawing r:id="rId1"/>':'')+'</worksheet>';
}
const rel=(id,type,target)=>'<Relationship Id="rId'+id+'" Type="'+R+'/'+type+'" Target="'+target+'"/>';
const rels=x=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="'+P+'">'+x.join('')+'</Relationships>';
const cache=(range,values)=>'<c:numRef><c:f>'+esc(range)+'</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="'+values.length+'"/>'+values.map((v,i)=>'<c:pt idx="'+i+'"><c:v>'+finite(v)+'</c:v></c:pt>').join('')+'</c:numCache></c:numRef>';
function chart(model,points){
  const end=6+points.length, last=col(model.steps.length+1);
  const cat="'Cenários'!$B$7:$B$"+end;
  const val="'Cenários'!$"+last+"$7:$"+last+"$"+end;
  const line='<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>'+esc(model.steps.at(-1).label)+'</c:v></c:tx>'+
    '<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="2D6F2D"/></a:solidFill></a:ln></c:spPr>'+
    '<c:marker><c:symbol val="circle"/><c:size val="4"/></c:marker>'+
    '<c:cat>'+cache(cat,points.map(p=>p.value))+'</c:cat><c:val>'+cache(val,points.map(p=>p.result))+'</c:val></c:ser>';
  const title='<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR"/><a:t>'+esc('Sensibilidade | '+model.title)+'</a:t></a:r></a:p></c:rich></c:tx></c:title>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="'+C+'" xmlns:a="'+A+'">'+
    '<c:lang val="pt-BR"/><c:chart>'+title+'<c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>'+
    line+'<c:axId val="50321"/><c:axId val="50322"/></c:lineChart>'+
    '<c:catAx><c:axId val="50321"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="50322"/><c:tickLblPos val="nextTo"/></c:catAx>'+
    '<c:valAx><c:axId val="50322"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="50321"/><c:tickLblPos val="nextTo"/></c:valAx>'+
    '</c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>';
}
function drawing(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="'+D+'" xmlns:a="'+A+'">'+
    '<xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'+
    '<xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>23</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'+
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Sensibilidade"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>'+
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="'+C+'">'+
    '<c:chart xmlns:c="'+C+'" xmlns:r="'+R+'" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
}
export async function buildWorkbook(model,inputs,{compress=true}={}){
  const result=calculate(model,inputs), points=scenario(model,inputs);
  if(points.length<5)throw Error('Cenários insuficientes para este conjunto de entradas.');
  const url='https://confenge.com.br/ferramentas/planilhas/'+model.slug+'/';
  const refs=Object.fromEntries(model.fields.map((f,i)=>[f.key,"'Entradas'!$B$"+(i+4)]));
  const cover=[
    [{v:'CONFENGE | ENGENHARIA',s:'title'}],
    [{v:model.title,s:'subtitle'}],[model.summary],[],
    [{v:'MODELO',s:'label'},model.slug],[{v:'TIPO',s:'label'},'Memória parametrizada e editável'],[],
    [{v:'INDICADOR PRINCIPAL',s:'head'},model.steps.at(-1).label],
    [{v:'RESULTADO',s:'head'},{v:result.primary,f:"'Memória'!B"+(model.steps.length+4),s:'result'}],
    [{v:'UNIDADE',s:'label'},model.steps.at(-1).unit],[],
    [{v:'MÉTODO',s:'label'},model.method],
    [{v:'LIMITAÇÕES',s:'label'},model.limits],
    [{v:'REFERÊNCIAS',s:'label'},model.reference],
    [{v:'FERRAMENTA ONLINE',s:'label'},url],[],
    ['Modelo editável. Confira hipóteses e parâmetros normativos antes de utilizar em projeto.']
  ];
  const inputsRows=[
    [{v:'CONFENGE | ENTRADAS',s:'title'}],
    ['Altere os valores azuis. As fórmulas das outras abas estão vinculadas às entradas.'],
    [{v:'PARÂMETRO',s:'head'},{v:'VALOR',s:'head'},{v:'UNIDADE',s:'head'},{v:'DOMÍNIO ADOTADO',s:'head'}],
    ...model.fields.map(f=>[{v:f.label,s:'label'},{v:Number(inputs[f.key]),s:'input'},f.unit,f.min+' a '+f.max])
  ];
  const rowRefs={...refs};
  const memory=[
    [{v:'CONFENGE | MEMÓRIA',s:'title'}],[model.title],
    [{v:'ETAPA',s:'head'},{v:'VALOR',s:'head'},{v:'UNIDADE',s:'head'},{v:'EXPRESSÃO',s:'head'}],[]
  ];
  for(const [i,s] of model.steps.entries()){
    const rn=i+5, formula=excelExpression(s.expr,rowRefs);
    rowRefs[s.key]='$B$'+rn;
    memory.push([{v:s.label,s:'label'},{v:result.scope[s.key],f:formula,s:'result'},s.unit,s.expr]);
  }
  const scenarios=[
    [{v:'CONFENGE | CENÁRIOS',s:'title'}],[model.title],
    ['Variação de '+model.fields.find(f=>f.key===model.driver).label+' mantendo demais entradas constantes.'],[],
    [{v:'MULTIPLICADOR',s:'head'},{v:'ENTRADA VARIADA',s:'head'},...model.steps.map(s=>({v:s.label,s:'head'}))],
    ['vezes',model.fields.find(f=>f.key===model.driver).unit,...model.steps.map(s=>s.unit)]
  ];
  points.forEach((p,i)=>{
    const rn=i+7;
    const vals=[{v:p.factor,s:'input'},{v:p.value,f:refs[model.driver]+'*A'+rn,s:'input'}];
    const sr={...refs,[model.driver]:'$B'+rn};
    model.steps.forEach((s,j)=>{
      const f=excelExpression(s.expr,sr);
      sr[s.key]='$'+col(j+2)+rn;
      vals.push({v:p.steps[j].value,f,s:'result'});
    });
    scenarios.push(vals);
  });
  const notes=[
    [{v:'CONFENGE | RESPONSABILIDADE',s:'title'}],
    ['Modelo',model.title],['Finalidade',model.summary],
    ['Método',model.method],['Restrições',model.limits],
    ['Referências de escopo',model.reference],
    ['Status','Exemplo de cálculo com dados demonstrativos. Não é certificado de conformidade normativa.'],
    ['Verificação','Profissional habilitado deve conferir premissas, unidades, revisão normativa, limites e dados reais.'],
    ['Versão','2026-11-21'],['Origem',url]
  ];
  const sh=[
    ['Resumo',cover,[42,108],{}],
    ['Entradas',inputsRows,[52,25,28,36],{freeze:3,merge:['A1:D1']}],
    ['Memória',memory,[55,28,30,89],{freeze:3,merge:['A1:D1']}],
    ['Cenários',scenarios,[22,32,...model.steps.map(()=>28),28,28,28,28,28],{freeze:6,drawing:true,merge:['A1:E1']}],
    ['Notas',notes,[37,125],{}]
  ];
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
      sh.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'+
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'+
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'},
    {name:'_rels/.rels',data:rels([
      '<Relationship Id="rId1" Type="'+R+'/officeDocument" Target="xl/workbook.xml"/>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
      '<Relationship Id="rId3" Type="'+R+'/extended-properties" Target="docProps/app.xml"/>'
    ])},
    {name:'docProps/core.xml',data:'<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+esc('CONFENGE | '+model.title)+'</dc:title><dc:creator>CONFENGE</dc:creator></cp:coreProperties>'},
    {name:'docProps/app.xml',data:'<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CONFENGE</Application></Properties>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="'+X+'" xmlns:r="'+R+'"><bookViews><workbookView/></bookViews><sheets>'+
      sh.map((s,i)=>'<sheet name="'+esc(s[0])+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:rels([...sh.map((_,i)=>rel(i+1,'worksheet','worksheets/sheet'+(i+1)+'.xml')),rel(6,'styles','styles.xml')])},
    {name:'xl/styles.xml',data:S},
    ...sh.map((s,i)=>({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheet(s[1],s[2],s[3])})),
    {name:'xl/worksheets/_rels/sheet4.xml.rels',data:rels([rel(1,'drawing','../drawings/drawing1.xml')])},
    {name:'xl/drawings/drawing1.xml',data:drawing()},
    {name:'xl/drawings/_rels/drawing1.xml.rels',data:rels([rel(1,'chart','../charts/chart1.xml')])},
    {name:'xl/charts/chart1.xml',data:chart(model,points)}
  ];
  return zip(files,{compress});
}
