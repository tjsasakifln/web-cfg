// Nestas duas ferramentas o fragmento da URL identifica a operação em andamento.
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  const conteudo = document.getElementById('conteudo');
  conteudo.focus({ preventScroll: true });
  conteudo.scrollIntoView({ block: 'start' });
});
