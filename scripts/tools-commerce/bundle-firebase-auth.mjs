/** Build the same-origin Firebase Auth surface for browser tools. */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'assets/tools-commerce/firebase-auth.mjs');
mkdirSync(dirname(output), { recursive: true });
await build({
  absWorkingDir: root, entryPoints: ['scripts/tools-commerce/firebase-auth-entry.mjs'],
  outfile: output, bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  legalComments: 'eof', minify: true, sourcemap: false, logLevel: 'warning',
});
