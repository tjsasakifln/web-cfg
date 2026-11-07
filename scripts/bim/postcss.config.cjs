// Scope WebSfM before Vite fingerprints its main CSS, lazy CSS and dependents.
module.exports = {
  plugins: [{
    postcssPlugin: 'confenge-workspace',
    OnceExit(root, { AtRule }) {
      const scope = new AtRule({
        name: 'scope',
        params: '(:root) to (.site-header, .site-footer, .breadcrumbs, .skip-link, .svg-sprite)',
      });
      for (const node of [...root.nodes]) {
        if (node.type === 'atrule' && /^(charset|import|font-face|keyframes|property)$/.test(node.name)) continue;
        scope.append(node);
      }
      if (scope.nodes?.length) root.append(scope);
    },
  }],
};
