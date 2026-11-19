// SPDX-License-Identifier: GPL-3.0-or-later
// Functional probe adapted from FreeCAD-Web v1.0.9 (Virtastic, LGPL-2.1-or-later).
const PROBE = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,126,1,126,2,12,1,3,101,110,118,4,
  119,97,105,116,0,0,3,2,1,0,5,3,1,4,1,7,5,1,1,102,0,1,10,8,1,6,0,32,0,16,0,11]);

/** This tiny module runs before downloading the 503 MB engine. No UA assumptions. */
export async function capabilities(scope = globalThis) {
  if (!scope.isSecureContext) return { ok: false, reason: 'Abra esta ferramenta por uma conexão HTTPS.' };
  if (!scope.crossOriginIsolated || typeof scope.SharedArrayBuffer !== 'function') {
    return { ok: false, reason: 'O navegador não recebeu o isolamento necessário. Reabra esta página diretamente, fora de um quadro incorporado.' };
  }
  const wasm = scope.WebAssembly;
  if (!wasm || typeof wasm.Suspending !== 'function' || typeof wasm.promising !== 'function' || !wasm.validate(PROBE)) {
    return { ok: false, reason: 'Este navegador ainda não oferece WebAssembly de 64 bits com JSPI. Experimente uma versão atual do Chrome, Edge ou Firefox em um computador.' };
  }
  const canvas = scope.document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return { ok: false, reason: 'O modelador precisa de WebGL 2 com aceleração gráfica. Confira essa opção nas configurações do navegador.' };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  let timer;
  try {
    const probe = async () => {
      const { instance } = await wasm.instantiate(PROBE, { env: { wait: new wasm.Suspending(value => Promise.resolve(value)) } });
      const fn = wasm.promising(instance.exports.f);
      if (await fn(7n) !== 7n) throw new Error('JSPI result');
      let rejected = false;
      try { await fn(7); } catch { rejected = true; }
      if (!rejected) throw new Error('memory64 ABI');
    };
    await Promise.race([probe(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('JSPI timeout')), 3000); })]);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'O teste de execução 3D não terminou neste navegador. Atualize-o ou use outro computador antes de baixar o ambiente.' };
  } finally { clearTimeout(timer); }
}
