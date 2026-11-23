const initialMain = document.getElementById('conteudo');
const skip = document.querySelector('.skip-link');
function bindEditor() {
  const app = document.querySelector('chili3d-main-window');
  if (!app) return;
  observer.disconnect();
  initialMain.hidden = true;
  initialMain.removeAttribute('id');
  app.id ||= 'conteudo';
  app.tabIndex = -1;
  app.setAttribute('role', 'main');
  app.setAttribute('aria-label', 'Editor de sólidos 3D');
  skip.href = '#' + app.id;
}
const observer = new MutationObserver(bindEditor);
observer.observe(document.body, { childList: true });
bindEditor();
