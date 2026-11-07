// Local examples are fetched only when the visitor opens their panel.
const panel = document.querySelector('#suite-instructions');
const area = panel.querySelector('[data-area]');
const task = panel.querySelector('[data-task]');
const text = panel.querySelector('[data-script]');
const status = panel.querySelector('[role=status]');
let packs;
function writeText() {
  text.value = packs[area.selectedIndex].tasks[task.selectedIndex].text;
  status.textContent = '';
}
function selectArea() {
  task.replaceChildren(...packs[area.selectedIndex].tasks.map(row => new Option(row.name)));
  writeText();
}
panel.addEventListener('toggle', async () => {
  if (!panel.open || packs || panel.dataset.loading) return;
  panel.dataset.loading = 'true';
  try {
    const response = await fetch(new URL('./studio/roteiros.json', import.meta.url));
    if (!response.ok) throw new Error();
    packs = await response.json();
    area.replaceChildren(...packs.map(row => new Option(row.name)));
    selectArea();
  } catch {
    status.textContent = 'Os exemplos não carregaram. Feche e abra esta seção para tentar novamente.';
  } finally { delete panel.dataset.loading; }
});
area.addEventListener('change', selectArea);
task.addEventListener('change', writeText);
panel.querySelector('[data-copy]').addEventListener('click', async () => {
  if (!text.value.trim()) return;
  try {
    await navigator.clipboard.writeText(text.value);
    status.textContent = 'Texto copiado.';
  } catch {
    text.focus(); text.select();
    status.textContent = 'Texto selecionado. Use a opção Copiar do dispositivo.';
  }
});
