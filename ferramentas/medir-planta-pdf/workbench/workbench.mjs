const mount = document.querySelector('#medicao-montagem');
const launch = document.querySelector('#medicao-abrir');
const template = document.querySelector('#medicao-runtime-template');

launch?.addEventListener('click', () => {
  const frame = template?.content.firstElementChild?.cloneNode(true);
  if (!mount || !frame) return;
  mount.replaceChildren(frame);
  frame.focus();
});
