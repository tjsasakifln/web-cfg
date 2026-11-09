// Exporta números e fórmulas editáveis. Textos do projeto são células de texto.
import { calcular } from './orcamento.js';
import { Decimal } from './vendor/precifica.js';
import { writeXlsx } from './vendor/takeoff-xlsx.js';

function numeric(value, style, formula) {
  const decimal = new Decimal(value);
  if (decimal.sd() > 15) throw new Error('um valor excede as 15 casas significativas do Excel. Use o CSV para preservar a precisão.');
  const cell = { v: decimal.toNumber(), s: style };
  if (formula) cell.f = formula;
  return cell;
}
const header = names => names.map(v=>({v,s:'head'}));

export async function planilhaExcel(project) {
  const result = calcular(project);
  if (!result.linhas.length) throw new Error('Adicione pelo menos um serviço.');
  const detail = [header(['Etapa','Código','Serviço','Unidade','Quantidade','Custo unitário (R$)','Custo direto (R$)','Referência'])];
  const components = [header(['Código do serviço','Serviço','Tipo','Insumo','Unidade','Coeficiente','Preço do insumo (R$)','Custo por unidade (R$)'])];
  const summary = [
    ['Obra',project.titulo || 'Orçamento de obras'],['BDI',numeric(new Decimal(project.bdi).div(100),'pct')],
    ['Custo direto',numeric(result.direto,'boldMoney','SUM(B7:B'+(6+result.etapas.length)+')')],
    ['Acréscimo de BDI',numeric(result.acrescimo,'money','ROUND(B3*B2,2)')],
    ['Total com BDI',numeric(result.total,'boldMoney','SUM(B3:B4)')], header(['Etapa','Subtotal direto (R$)'])
  ];
  for (const stage of result.etapas) {
    const start = detail.length + 1;
    for (const line of result.linhas.filter(i=>i.etapa===stage.nome)) {
      let priceFormula;
      if (line.composicao) {
        const first = components.length + 1;
        for (const k of line.composicao) {
          const row=components.length+1;
          const part=new Decimal(k.coef).times(k.preco).toDecimalPlaces(4);
          components.push([line.codigo,line.descricao,k.tipo,k.descricao,k.unidade,numeric(k.coef,'qty'),numeric(k.preco,'rate'),numeric(part,'rate','ROUND(F'+row+'*G'+row+',4)')]);
        }
        priceFormula="ROUND(SUM('Composições'!H"+first+':H'+components.length+'),4)';
      }
      const row=detail.length+1;
      detail.push([line.etapa,line.codigo,line.descricao,line.unidade,numeric(line.quantidade,'qty'),numeric(line.unitario,'rate',priceFormula),numeric(line.total,'money','ROUND(E'+row+'*F'+row+',2)'),line.fonte]);
    }
    summary.push([stage.nome,numeric(stage.total,'money',"SUM('Orçamento'!G"+start+':G'+detail.length+')')]);
  }
  return writeXlsx([
    {name:'Resumo',rows:summary,cols:[39,35]},
    {name:'Orçamento',rows:detail,cols:[26,17,56,12,18,23,23,55],freeze:1},
    {name:'Composições',rows:components,cols:[18,40,18,45,12,20,23,26],freeze:1}
  ],{title:project.titulo || 'Orçamento de obras'});
}
