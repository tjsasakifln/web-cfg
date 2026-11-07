// Check the final HTML after navigation promotion, CSS fingerprinting and script rewriting.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parse } from 'parse5';

const site = resolve(process.argv[2] || '_site');
const read = p => readFileSync(join(site, p), 'utf8');
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const hasClass = (node, name) => (attr(node, 'class') || '').split(/\s+/).includes(name);
function elements(node) {
  return (node.childNodes || []).flatMap(child => [child, ...elements(child)]).filter(n => n.tagName);
}

const portal = elements(parse(read('bim/index.html')));
const files = JSON.parse(read('.well-known/css-assets.json')).files;
const siteCss = files['styles.css'].href;
const toolCss = files['bim/ferramentas.css']?.href;
assert.ok(toolCss, 'A folha de estilos das ferramentas deve integrar o manifesto público de CSS');
const toolScript = '/bim/web/pular-navegacao.mjs';
const navSource = readFileSync(resolve(import.meta.dirname, '../../js/modules/nav.js'), 'utf8');
const sharedMenu = navSource.match(/^ *\/\/ BEGIN SHARED SITE MENU[^\n]*\n([\s\S]+?)^ *\/\/ END SHARED SITE MENU$/m)?.[1];
assert.ok(sharedMenu, 'Componente de navegação institucional ausente na fonte');
const normalize = text => text.trim().split('\n').map(line => line.trim()).join('\n');
assert.ok(normalize(read(toolScript)).includes(normalize(sharedMenu)), 'Módulo BIM sem o menu institucional');

// Check every shipped HTML page, including downloadable HTML and future tools.
const problems = [];
const html = readdirSync(site, {recursive: true}).filter(f => f.endsWith('.html'));
const logo = cls => attr(elements(portal.find(n => hasClass(n, cls))).find(n => n.tagName === 'img'), 'src');
const headerLogo = logo('site-header');
const footerLogo = logo('site-footer');
for (const file of html) {
  const nodes = elements(parse(read(file)));
  const styles = nodes.filter(n => n.tagName === 'link' && attr(n, 'rel') === 'stylesheet').map(n => attr(n, 'href'));
  const requiredStyles = file === 'index.html' ? [files['assets/home-base.css'].href, files['assets/home-10x.css'].href] : [siteCss];
  if (!requiredStyles.every(href => styles.includes(href))) problems.push(file + ': folha de estilo institucional ausente');
  const privateConsole = file === join('ops', 'index.html');
  const header = nodes.find(n => n.tagName === 'header'
    && (privateConsole || hasClass(n, 'site-header') || hasClass(n, 'pp-header')));
  const footer = nodes.find(n => n.tagName === 'footer' && hasClass(n, 'site-footer'));
  const hasLogo = (section, src) => section && elements(section).some(n => n.tagName === 'img' && attr(n, 'src') === src);
  if (!hasLogo(header, headerLogo)) problems.push(file + ': logotipo institucional ausente do cabeçalho');
  if (!privateConsole && !hasLogo(footer, footerLogo)) problems.push(file + ': rodapé institucional ausente');
}

const pages = ['bim/web', 'bim/fotogrametria'].flatMap(dir => {
  const files = readdirSync(join(site, dir), {recursive: true}).filter(f => f.endsWith('.html'));
  assert.ok(files.length, 'Ferramentas ausentes em ' + dir);
  return files.map(f => join(dir, f));
});
for (const page of pages) {
  try {
    const nodes = elements(parse(read(page)));
    for (const [tag, cls] of [['header', 'site-header'], ['footer', 'site-footer']]) {
      const matches = ns => ns.filter(n => n.tagName === tag && hasClass(n, cls));
      const sections = matches(nodes);
      assert.equal(sections.length, 1, cls + ' ausente ou repetido');
      const source = matches(portal);
      assert.equal(source.length, 1);
      const signature = section => elements(section)
        .filter(n => ['a', 'img', 'nav', 'button'].includes(n.tagName))
        .map(n => [n.tagName, attr(n,'href'), attr(n,'src'), attr(n,'id'), attr(n,'aria-label'), attr(n,'aria-controls')]);
      assert.deepEqual(signature(sections[0]), signature(source[0]), 'Navegação ou logotipos divergentes em ' + cls);
    }
    for (const rel of ['icon', 'apple-touch-icon']) {
      const icons = ns => ns.filter(n => n.tagName === 'link' && attr(n, 'rel') === rel).map(n => attr(n, 'href'));
      assert.deepEqual(icons(nodes), icons(portal), 'Ícone do site divergente: ' + rel);
    }
    const scripts = nodes.filter(n => n.tagName === 'script').map(n => (attr(n, 'src') || '').split('?')[0]);
    assert.equal(scripts.filter(src => src === toolScript).length, 1, 'Menu institucional da ferramenta');
    const bootstrap = nodes.find(n => n.tagName === 'script' && (attr(n, 'src') || '').split('?')[0] === toolScript);
    assert.equal(bootstrap.parentNode.tagName, 'head', 'Preparar o menu antes da primeira pintura');
    for (const flag of ['type', 'async', 'defer']) {
      assert.equal(attr(bootstrap, flag), undefined, 'O preparo do menu precisa bloquear o parser: ' + flag);
    }
    assert.ok(!scripts.includes('/script.js'), 'O módulo comercial interfere nas abas e nos arquivos locais');
    const styles = nodes.filter(n => n.tagName === 'link' && attr(n,'rel') === 'stylesheet').map(n => attr(n,'href'));
    assert.equal(styles.filter(s => s === siteCss).length, 1, 'Folha institucional');
    assert.equal(styles.at(-1), toolCss, 'O tema das ferramentas deve vir depois dos estilos locais');
    assert.ok(nodes.some(n => n.tagName === 'body' && hasClass(n, 'bim-tool')), 'Tema desativado no body');
    const skip = nodes.filter(n => n.tagName === 'a' && hasClass(n,'skip-link'));
    assert.equal(skip.length, 1, 'Atalho de teclado ausente ou repetido');
    const main = nodes.filter(n => n.tagName === 'main');
    assert.equal(main.length, 1, 'Região principal');
    assert.equal(attr(skip[0],'href'), '#' + attr(main[0],'id'), 'Destino do atalho de teclado');
    assert.equal(attr(main[0],'tabindex'), '-1', 'Foco no conteúdo');
  } catch (error) {
    problems.push(page + ': ' + error.message.split('\n')[0]);
  }
}
assert.equal(problems.length, 0, problems.join('\n'));
console.log('Identidade institucional conferida em ' + html.length + ' páginas, incluindo ' + pages.length + ' telas BIM em ' + relative(process.cwd(), site));
