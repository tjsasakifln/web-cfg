const panel = document.getElementById('pacotes');
const requested = new URLSearchParams(location.search).get('area');
if (panel) {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'button button-primary';
  open.textContent = 'Consultar especialidades';
  panel.append(open);
  open.addEventListener('click', load);
  if (requested) load();

  async function load() {
    open.disabled = true;
    try {
      const data = await read('/assets/fields/index.json');
      const label = document.createElement('label');
      label.textContent = 'Área de engenharia ';
      const select = document.createElement('select');
      label.append(select);
      select.append(new Option('Escolha uma área', ''));
      const packs = new Map();
      for (const row of data.packs) {
        if (!/^field\.[a-z0-9-]+$/.test(row.id)) continue;
        select.append(new Option(row.name, row.id));
        packs.set(row.id, row);
      }
      const card = document.createElement('article');
      card.setAttribute('aria-live', 'polite');
      panel.append(label, card);
      open.remove();
      select.addEventListener('change', () => show(select.value, true));
      if (requested && packs.has(requested)) {
        select.value = requested;
        await show(requested, false);
      }
      async function show(id, updateUrl) {
        if (updateUrl) {
          const url = new URL(location.href);
          if (id) url.searchParams.set('area', id); else url.searchParams.delete('area');
          url.hash = 'pacotes';
          history.replaceState(null, '', url);
        }
        card.replaceChildren();
        if (!packs.has(id)) return;
        try {
          const pack = await read('/assets/fields/' + id.slice(6) + '/pack.json');
          if (select.value !== id) return;
          const reach = { well: 'Cobertura ampla', partly: 'Cobertura parcial', thin: 'Conteúdo inicial' };
          text(card, 'h3', pack.name);
          text(card, 'p', reach[pack.coverage.today] + ' | ' + pack.summary);
          list(card, 'Recursos da área', (pack.coverage.does || []));
          list(card, 'Limitações informadas pelo fornecedor', (pack.coverage.not_yet || []).map(item => item.text));
          const sources = new Set([
            ...(pack.calcs || []).flatMap(item => item.sources || []),
            ...(pack.tables || []).map(item => item.source)
          ].filter(Boolean));
          list(card, 'Referências declaradas', Array.from(sources));
          const apps = Object.keys(pack.hosts).filter(key => key !== 'super');
          if (apps.length) {
            text(card, 'h4', 'Usar o pacote');
            text(card, 'p', 'Abra uma das ferramentas, procure “Field packs” e use “Install here” na área escolhida. As planilhas disponíveis têm o botão “Insert in this file”.');
            const links = document.createElement('ul');
            for (const key of apps) {
              const li = document.createElement('li'), link = document.createElement('a');
              link.href = '/cad/aplicativos/#' + key + 'craft';
              link.textContent = key[0].toUpperCase() + key.slice(1) + 'Craft';
              li.append(link); links.append(li);
            }
            card.append(links);
          }
          text(card, 'p', 'Autoria: ' + pack.author + '. Licença: ' + pack.license + '.');
        } catch { if (select.value === id) text(card, 'p', 'A ficha não carregou. Selecione a área novamente.'); }
      }
    } catch {
      open.disabled = false;
      open.textContent = 'Tentar carregar as especialidades novamente';
    }
  }
}
async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error();
  return response.json();
}
function text(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
}
function list(parent, heading, items) {
  if (!items.length) return;
  text(parent, 'h4', heading);
  const list = document.createElement('ul');
  for (const item of items) text(list, 'li', item);
  parent.append(list);
}
