// All cost inputs and the calculation memory stay in this browser.
import {tabDraft} from '/assets/js/tab-draft.mjs';

const host = document.getElementById('modela-custo');
if (host) mountCost(host);

function mountCost(root) {
  root.innerHTML = `
    <form class="modela-cost" id="cost-form">
      <p>Informe os custos da sua referência local. Informe o terreno em uma linha própria caso queira incluí-lo no total.</p>
      <div class="cost-grid">
        <label>Local de referência<input name="local" required maxlength="120" placeholder="Município e UF"></label>
        <label>Data-base<input name="data" type="date" required></label>
        <label>Fonte do orçamento<input name="fonte" required maxlength="200" placeholder="Identificação do orçamento ou publicação"></label>
        <label>Modalidade<select name="modalidade"><option value="synthetic_budget">Orçamento sintético</option><option value="cub_similar">CUB de projeto semelhante</option></select></label>
      </div>
      <div data-items></div>
      <button type="button" class="button" data-add>Adicionar item</button>
      <div class="cost-grid">
        <label>BDI justificado (%)<input type="number" min="0" step="any" name="bdi" placeholder="Opcional"></label>
        <label>Fonte e justificativa do BDI<input name="bdifonte" maxlength="240"></label>
        <label>Depreciação arbitrada (%)<input type="number" min="0" max="99.9999" step="any" name="dep" placeholder="Opcional"></label>
        <label>Fonte e justificativa da depreciação<input name="depfonte" maxlength="240"></label>
      </div>
      <div class="cost-actions"><button type="submit" class="button button-primary">Calcular custo</button>
        <button type="button" class="button" data-example>Usar exemplo fictício de custo</button></div>
    </form>
    <section aria-live="polite" aria-label="Resultado do custo" data-output></section>
    <p class="mp-note">Os dados de custo ficam no rascunho desta aba. Ao recarregar, você pode retomar os dados e calcular novamente.</p>
    <button type="button" class="mp-btn" data-clear-draft hidden>Limpar rascunho de custo</button>
    <p class="mp-note" role="status" data-draft-status></p>
  `;
  const form = root.querySelector('form');
  const output = root.querySelector('[data-output]');
  const items = form.querySelector('[data-items]');
  const submit = form.querySelector('[type="submit"]');
  const clear = root.querySelector('[data-clear-draft]');
  const draftStatus = root.querySelector('[data-draft-status]');
  const costFields = ['local','data','fonte','modalidade','bdi','bdifonte','dep','depfonte'];
  const itemFields = ['descricao','categoria','qtd','unidade','unitario'];
  const field = (element, name) => element.querySelector('[name="'+name+'"]');
  const values = (element, names) => Object.fromEntries(names.map(name => [name, field(element, name).value]));
  const snapshot = () => ({
    fields: values(form, costFields),
    items: Array.from(items.children, row => values(row, itemFields)),
  });
  function report(text, error) {
    if (draftStatus.textContent !== text) draftStatus.textContent = text;
    draftStatus.classList.toggle('mp-error', Boolean(error));
  }
  const draft = tabDraft('confenge.modela.custo.v1', snapshot, () => submit.disabled, report);
  let serial = 0;
  let revision = 0;
  function invalidate() { revision++; output.replaceChildren(); }
  function edited() { invalidate(); clear.hidden = false; draft.schedule(); }
  function addItem(sample = {}) {
    const fs = document.createElement('fieldset');
    fs.className = 'cost-item'; fs.innerHTML = `
      <legend></legend><div class="cost-grid">
      <label>Descrição<input name="descricao" required maxlength="160"></label>
      <label>Categoria<select name="categoria"><option value="building_component">Benfeitoria</option><option value="land">Terreno incluído</option></select></label>
      <label>Quantidade<input name="qtd" type="number" step="any" min="0" required></label>
      <label>Unidade<input name="unidade" required maxlength="12" placeholder="m²"></label>
      <label>Custo unitário (R$)<input name="unitario" type="number" min="0" step="any" required></label>
      </div><button class="button" type="button">Remover item</button>`;
    fs.querySelector('legend').textContent = 'Item ' + (++serial);
    for (const name of itemFields) if (sample[name] !== undefined) field(fs, name).value = sample[name];
    fs.querySelector('button').onclick = () => { fs.remove(); if (!items.children.length) addItem(); edited(); };
    items.append(fs);
    return fs;
  }
  addItem();
  form.querySelector('[data-add]').onclick = () => { addItem().querySelector('input').focus(); edited(); };
  form.addEventListener('input', edited);
  form.querySelector('[data-example]').onclick = () => {
    if (!clear.hidden && !window.confirm('Substituir os dados de custo pelo exemplo fictício?')) return;
    items.replaceChildren(); serial = 0;
    form.elements.local.value = 'Florianópolis, SC'; form.elements.data.value = '2026-11-01';
    form.elements.fonte.value = 'Orçamento sintético fictício para demonstração'; form.elements.modalidade.value = 'synthetic_budget';
    form.elements.bdi.value = '20'; form.elements.bdifonte.value = 'Composição demonstrativa de despesas e bonificação.';
    form.elements.dep.value = '10'; form.elements.depfonte.value = 'Hipótese demonstrativa de desgaste físico.';
    addItem({descricao:'Edificação térrea',qtd:100,unidade:'m²',unitario:2800});
    edited();
  };
  clear.onclick = () => {
    if (!window.confirm('Limpar os dados de custo desta aba?') || !draft.clear()) return;
    invalidate(); form.reset(); items.replaceChildren(); serial = 0; addItem(); clear.hidden = true;
  };
  try {
    const saved = draft.read();
    if (saved) {
      clear.hidden = false;
      const hasFields = (data, names) => data && names.every(name => typeof data[name] === 'string');
      if (!hasFields(saved.fields, costFields) || !Array.isArray(saved.items) || !saved.items.length ||
        !saved.items.every(row => hasFields(row, itemFields))) throw new Error('Rascunho inválido');
      for (const name of costFields) field(form, name).value = saved.fields[name];
      items.replaceChildren(); serial = 0; saved.items.forEach(addItem);
      root.closest('details').open = true;
      report('Rascunho de custo recuperado nesta aba. Confira os dados e calcule novamente.');
    }
  } catch {
    report('O rascunho de custo não pôde ser lido.', true);
  }
  form.onsubmit = async event => {
    event.preventDefault(); invalidate(); const request = revision;
    const get = name => form.elements[name].value.trim();
    if ((get('bdi') && !get('bdifonte')) || (get('dep') && !get('depfonte'))) {
      output.textContent = 'Informe a fonte e a justificativa de cada percentual adotado.'; return;
    }
    const bom = {schema_version:'MP-COST-BOM/1',currency:'BRL',reference_location:get('local'),reference_date:get('data'),
      direct_cost:{mode:get('modalidade'),source:get('fonte')},items:Array.from(items.children, (row, i) => {
        const val = n => row.querySelector('[name="'+n+'"]').value.trim();
        return {item_id:String(i+1),category:val('categoria'),description:val('descricao'),quantity:Number(val('qtd')),unit:val('unidade'),unit_cost:Number(val('unitario')),source:get('fonte'),include_land:val('categoria')==='land'};
      })};
    if (get('bdi')) bom.bdi={mode:'justified',rate:Number(get('bdi'))/100,source:get('bdifonte'),justification:get('bdifonte')};
    if (get('dep')) bom.depreciation={mode:'arbitrated',rate:Number(get('dep'))/100,source:get('depfonte'),justification:get('depfonte')};
    submit.disabled = true; draft.refreshGuard(); output.textContent='Preparando o cálculo no seu dispositivo…';
    try {
      const {cost} = await import('./engine/client.mjs');
      const result = await cost({bom, value_basis:get('dep')?'depreciated_cost':'reconstruction_cost',include_depreciation:Boolean(get('dep'))});
      if (request !== revision) return;
      if (!result.computable) throw new Error(result.issues.map(issue=>issue.message).join(' '));
      const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
      const heading = document.createElement('h3'); heading.textContent='Custo calculado de '+money(result.value.point);
      const details = document.createElement('p'); const m=result.memory;
      details.textContent='Custo direto '+money(m.direct_subtotal)+' · BDI '+money(m.bdi_amount)+' · Depreciação '+money(m.depreciation_amount??0)+' · Terreno incluído '+money(m.land_subtotal)+'.';
      const download = document.createElement('button'); download.className='button'; download.type='button'; download.textContent='Baixar memória de custo';
      download.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({entrada:bom,resultado:result},null,2)],{type:'application/json'}));a.download='modela-pro-memoria-de-custo.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
      output.replaceChildren(heading,details,download);
    } catch(error) { if (request===revision) output.textContent='Cálculo não concluído. '+error.message; }
    finally { submit.disabled=false; draft.refreshGuard(); }
  };
}
