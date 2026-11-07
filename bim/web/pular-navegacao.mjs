if (window.parent !== window && location.pathname === '/bim/web/visualizador.html' && location.hash === '#previa-local') {
  document.documentElement.classList.add('bim-previa-incorporada');
}
document.documentElement.classList.replace('no-js', 'js');

// Preserve o fragmento da operação ao pular a navegação com o teclado.
function pularParaConteudo(event) {
  event.preventDefault();
  const conteudo = document.getElementById('conteudo');
  conteudo.focus({ preventScroll: true });
  conteudo.scrollIntoView({ block: 'start' });
}
