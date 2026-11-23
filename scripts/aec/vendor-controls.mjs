export function useConfengeControlSurfaces(stylesheet) {
  stylesheet.walkDecls(declaration => {
    const property = declaration.prop.toLowerCase();
    // Keep the institutional keyboard ring from styles.css on tool controls.
    const focusOutline = property === 'outline'
      && /:focus(?:-visible|-within)?\b/.test(declaration.parent.selector || '');
    if (focusOutline || /(?:^|-)border(?:-[a-z]+)*-radius$/.test(property)
        || /(?:^|-)box-shadow$/.test(property)) {
      declaration.remove();
    } else if (/gradient\(/i.test(declaration.value)) {
      declaration.value = 'var(--soft, #eef2ee)';
      if (property === 'background-image') declaration.prop = 'background';
    }
  });
  stylesheet.walkRules(rule => {
    if (!rule.nodes?.length) rule.remove();
  });
  return stylesheet;
}
