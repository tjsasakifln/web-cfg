import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node patch-runtime.mjs <official-app.min.js> <output>');
const source = await readFile(input, 'utf8');
const sourceHash = '191af27513db065361156b6d8b5d262b6ae11657c0b28c51a0e28ee8b3dac94c';
if (createHash('sha256').update(source).digest('hex') !== sourceHash) throw new Error('unexpected draw.io runtime');
const start = source.indexOf('Editor.aiConfigs=');
const end = source.indexOf('};Editor.', start) + 2;
if (start < 0 || end < start) throw new Error('AI configuration boundary changed');
const patched = source.slice(0, start) + 'Editor.aiConfigs={};' + source.slice(end);
if (patched.includes('Editor.aiConfigs={gpt:')) throw new Error('AI configuration remains in runtime');
await writeFile(output, patched, 'utf8');
