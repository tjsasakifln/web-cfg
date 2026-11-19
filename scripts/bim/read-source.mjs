import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
// Test the exact source the distribution builder consumes.
export function readBimSource(name) {
  if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').includes('..'))throw Error('Nome de fonte inválido.');
  const override=new URL('overrides/'+name,import.meta.url);
  if(existsSync(override))return readFileSync(override,'utf8');
  return execFileSync('tar',['-xOf',new URL('aplicativo.tar.gz',import.meta.url).pathname,name],{encoding:'utf8'});
}
