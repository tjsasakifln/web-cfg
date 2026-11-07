// Build from a curated source snapshot. No access to a private GitHub repository is needed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const here = __dirname;
const root = path.resolve(here, '../..');
const target = process.argv[2];
if (!target) throw Error('Informe o diretório do artefato público.');
const site = path.resolve(target);
if (site === root || site === path.parse(site).root) throw Error('Destino de publicação inválido.');
const source = path.join(here, 'aplicativo.tar.gz');
const digest = createHash('sha256').update(fs.readFileSync(source)).update(fs.readFileSync(__filename))
  .update([process.version, process.platform, process.arch].join('/')).digest('hex');
// Compilers and npm packages must remain entirely outside the site's source census.
const cache = path.join(os.homedir(), '.cache', 'confenge-web-bim');
fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
const checkout = createHash('sha256').update(fs.realpathSync(root)).digest('hex').slice(0, 20);
const checkoutCache = path.join(cache, checkout);
fs.mkdirSync(checkoutCache, { recursive: true });
const dist = path.join(checkoutCache, digest);
function build(stage) {
  const dist = path.join(stage, 'dist');
  function run(program, args) {
    execFileSync(program, args, { cwd: stage, stdio: 'inherit' });
  }
  run('tar', ['-xzf', source]);
  run('npm', ['ci', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund']);
  run('npm', ['run', 'build']);

  // Keep the desktop lab shell versioned in bim/. Load its actual Vite entry chunks.
  const lab = path.join(dist, 'fotogrametria');
  const html = fs.readFileSync(path.join(lab, 'index.html'), 'utf8');
  const js = html.match(/<script\b[^>]*\bsrc="(\.\/assets\/[\w.-]+\.js)"/);
  const css = html.match(/<link\b[^>]*rel="stylesheet"[^>]*\bhref="(\.\/assets\/[\w.-]+\.css)"/);
  if (!js || !css) throw Error('As entradas de fotogrametria mudaram. Confira a versão do WebSfM.');
  fs.writeFileSync(path.join(lab, 'app.mjs'), 'import ' + JSON.stringify(js[1]) + ';\n');
  // The site's CSS fingerprint changes its directory. Vite's entry stylesheet
  // contains only embedded image URLs; the site rejects relative dependencies.
  fs.copyFileSync(path.join(lab, css[1]), path.join(lab, 'app.css'));
  fs.rmSync(path.join(lab, '_headers'), { force: true });
  fs.rmSync(path.join(lab, 'index.html'));

  // The site disallows Markdown documents in its public artifact. Retain notices verbatim.
  const web = path.join(dist, 'web');
  const index = path.join(web, 'avisos/INDEX.txt');
  let notices = fs.readFileSync(index, 'utf8');
  for (const file of fs.readdirSync(web, { recursive: true })) {
    if (!/\.(md|markdown)$/i.test(file)) continue;
    const original = path.join(web, file);
    const newName = file + '.txt';
    fs.renameSync(original, path.join(web, newName));
    if (file.startsWith('avisos/')) notices = notices.replaceAll(file.slice('avisos/'.length), newName.slice('avisos/'.length));
  }
  fs.writeFileSync(index, notices);
}
if (!fs.existsSync(dist)) {
  const temp = fs.mkdtempSync(path.join(checkoutCache, '.compilar-'));
  try {
    build(temp);
    try {
      fs.renameSync(path.join(temp, 'dist'), dist);
    } catch (e) {
      // Another build of the same immutable inputs may have finished first.
      if (!['EEXIST', 'ENOTEMPTY'].includes(e.code) || !fs.existsSync(dist)) throw e;
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
for (const dir of ['web', 'examples', 'fotogrametria']) {
  const out = path.join(site, 'bim', dir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(dist, dir), out, { recursive: true });
  if (dir !== 'examples') fs.cpSync(path.join(root, 'bim', dir), out, { recursive: true });
}
console.log('Aplicativo BIM publicado no artefato estático.');
