import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useConfengeControlSurfaces } from '../vendor-controls.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const dependencies = resolve(process.env.AEC_CROQUI_DEPS || sourceDirectory);
const require = createRequire(resolve(dependencies, 'package.json'));
const { build } = require('esbuild');
const postcss = require('postcss');
const output = resolve(process.argv[2] || resolve(sourceDirectory, '../../../ferramentas/croqui-de-obra/vendor'));
const modules = resolve(dependencies, 'node_modules');
const editorDirectory = resolve(modules, '@excalidraw/excalidraw/dist/prod');
const fontModule = resolve(editorDirectory, 'chunk-K2UTITRG.js');
const fallbackExpression = 'return r.push(new URL(n,jn.ASSETS_FALLBACK_URL)),r';
const exportedTextStyle = '_.setAttribute("style","white-space: pre;")';
const oldLiberation = './fonts/Liberation/LiberationSans-Regular.woff2';
const localLiberation = './fonts/Liberation/LiberationSans-Regular.ttf';

const result = await build({
  absWorkingDir: dependencies,
  entryPoints: { engine: resolve(sourceDirectory, 'engine.mjs') },
  outdir: output,
  nodePaths: [modules],
  bundle: true,
  splitting: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['production'],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file', '.svg': 'file', '.wasm': 'file' },
  plugins: [{
    name: 'confenge-strict-browser-policy',
    setup(builder) {
      builder.onLoad({ filter: /chunk-K2UTITRG\.js$/ }, async ({ path }) => {
        if (path !== fontModule) return;
        const source = await readFile(path, 'utf8');
        if ([fallbackExpression, exportedTextStyle, oldLiberation].some(fragment => source.split(fragment).length !== 2)) {
          throw new Error('O adaptador de política do navegador precisa ser revisto para esta versão do Excalidraw.');
        }
        const contents = source
          .replace(fallbackExpression, 'return r')
          .replace(exportedTextStyle, '_.style.setProperty("white-space","pre")')
          .replace(oldLiberation, localLiberation);
        return { contents, loader: 'js' };
      });
    },
  }],
  assetNames: 'files/[name]-[hash]',
  legalComments: 'linked',
  metafile: true,
});
// Excalidraw labels one browser storage slot like a credential. Quoting
// the property keeps the JavaScript object and the storage identifier intact.
const storageProperty = /\bOAI_API_KEY:("(?:excalidraw|openai|oai)[a-z0-9_-]+")/i;
let normalizedStorageProperties = 0;
for (const name of (await readdir(output)).filter(file => file.endsWith('.js'))) {
  const path = resolve(output, name);
  const javascript = await readFile(path, 'utf8');
  if (!storageProperty.test(javascript)) continue;
  await writeFile(path, javascript.replace(storageProperty, '"OAI_API_KEY":$1'), 'utf8');
  normalizedStorageProperties++;
}
if (normalizedStorageProperties !== 1) throw new Error('O identificador local do Excalidraw precisa ser revisado.');
const bundledFonts = resolve(editorDirectory, 'fonts');
const liberation = resolve(bundledFonts, 'Liberation');
await cp(bundledFonts, resolve(output, 'fonts'), {
  recursive: true,
  filter: path => path !== liberation,
});
await mkdir(resolve(output, 'fonts/Liberation'), { recursive: true });
await cp(resolve(sourceDirectory, 'legal/LiberationSans-Regular.ttf'), resolve(output, 'fonts/Liberation/LiberationSans-Regular.ttf'));
const stylesheet = resolve(output, 'engine.css');
const surface = useConfengeControlSurfaces(postcss.parse(await readFile(stylesheet, 'utf8')));
await writeFile(stylesheet, surface.toString(), 'utf8');

const notices = [
  'Croqui de obra CONFENGE. Integração local do editor Excalidraw 0.18.1.',
  'Código-fonte do Excalidraw: https://github.com/excalidraw/excalidraw/tree/v0.18.1',
  'Adaptação CONFENGE: fontes empacotadas localmente e atribuição CSS do SVG compatível com a CSP.',
  'A folha de estilo mantém a geometria e elimina gradientes, sombras e arredondamentos decorativos.',
  'Liberation Sans: versão 2.1.5 sob OFL, em substituição ao arquivo 1.05 do pacote.',
  'Construção: npm ci nesta pasta, seguida por node build.mjs CAMINHO-DE-SAÍDA.',
];
const packagePaths = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const matches = [...input.replaceAll('\\', '/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
  const leaf = matches.at(-1);
  if (leaf) {
    packagePaths.add(input.replaceAll('\\', '/').slice(0, leaf.index + leaf[0].length));
  }
}
await mkdir(resolve(output, 'licenses'), { recursive: true });
const legal = resolve(sourceDirectory, 'legal');
for (const name of (await readdir(legal)).filter(file => file.endsWith('.txt'))) {
  await cp(resolve(legal, name), resolve(output, 'licenses', name));
}
for (const path of [...packagePaths].sort()) {
  const directory = resolve(dependencies, path);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const licenseFiles = (await readdir(directory)).filter(name => /^(?:license|copying|notice)(?:[.-].*)?$/i.test(name));
  notices.push(`${manifest.name}@${manifest.version} — ${manifest.license ?? 'consultar fonte do componente'}`);
  for (const name of licenseFiles) {
    const prefix = manifest.name.replace(/[^a-zA-Z0-9_-]/g, '-');
    await cp(resolve(directory, name), resolve(output, 'licenses', `${prefix}-${manifest.version}-${name}`));
  }
}
await writeFile(resolve(output, 'NOTICE.txt'), notices.join('\n') + '\n', 'utf8');
