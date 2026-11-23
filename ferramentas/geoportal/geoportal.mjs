const allowed = new Set([
  'v=1&layers=florianopolis,sao-jose&camera=regional',
  'v=1&layers=florianopolis&camera=florianopolis',
  'v=1&layers=sao-jose&camera=sao-jose'
]);

for (const link of document.querySelectorAll('a[href*="/runtime/#"]')) {
  const fragment = link.hash.slice(1);
  if (!allowed.has(fragment)) link.removeAttribute('href');
}
