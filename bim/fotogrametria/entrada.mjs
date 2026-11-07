const entrada = document.getElementById('entrada');
const botao = document.getElementById('abrir');
const estado = document.getElementById('estado');
let estilo;
let carregando = false;

async function abrir() {
  if (carregando) return;
  carregando = true;
  botao.disabled = true;
  estado.textContent = 'Carregando o laboratório…';
  try {
    if (!estilo) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = new URL('./app.css?tema=confenge', import.meta.url);
      estilo = new Promise((ok, falhou) => {
        css.onload = ok;
        css.onerror = () => { css.remove(); estilo = undefined; falhou(); };
      });
      document.head.append(css);
    }
    await Promise.all([estilo, import('./app.mjs')]);
    entrada.hidden = true;
    document.body.classList.replace('preparar-fotos', 'bancada-fotos');
    document.getElementById('app').inert = false;
    document.getElementById('conteudo').focus({ preventScroll: true });
  } catch {
    estado.textContent = 'O laboratório não carregou. Confira sua conexão e recarregue a página para tentar novamente.';
    carregando = false;
    botao.disabled = false;
  }
}

botao.addEventListener('click', abrir);
if (location.hash === '#abrir') abrir();
