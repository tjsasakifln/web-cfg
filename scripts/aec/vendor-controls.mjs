export function useConfengeControlSurfaces(stylesheet) {
  stylesheet.walkDecls(declaration => {
    const property = declaration.prop.toLowerCase();
    if (/(?:^|-)border(?:-[a-z]+)*-radius$/.test(property)
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
