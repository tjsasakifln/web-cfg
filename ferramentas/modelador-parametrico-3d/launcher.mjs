const start = document.getElementById('modelador-abrir');
start?.addEventListener('click', () => {
  try { sessionStorage.setItem('confenge-freecad-start', String(Date.now())); } catch { /* shell offers its start button */ }
});
