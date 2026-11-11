// SPDX-License-Identifier: GPL-3.0-or-later
export const INPUT_FORMATS = new Set(['fcstd', 'step', 'stp', 'iges', 'igs', 'stl', '3mf', 'svg', 'dxf']);
export const EXPORT_FORMATS = new Set(['step', 'stp', 'iges', 'igs', 'stl', '3mf', 'svg', 'dxf']);
export const MAX_INPUT_BYTES = 128 * 1024 * 1024;
export const extension = name => String(name).split('.').pop().toLowerCase();
export const isBackup = name => /\.fcstd\d*$/i.test(name);

export function fileName(value) {
  let name = String(value).normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '');
  if (name.length > 160) { const suffix = name.match(/\.[a-z0-9]{1,8}$/i)?.[0] || ''; name = name.slice(0, 160 - suffix.length) + suffix; }
  return name || 'modelo.FCStd';
}

export function validateInput(file) {
  if (!INPUT_FORMATS.has(extension(file.name))) throw new Error('Abra um arquivo FCStd, STEP, IGES, STL, 3MF, SVG ou DXF.');
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_INPUT_BYTES) throw new Error('Selecione um arquivo com conteúdo de até 128 MiB.');
}

export function stagePath(path) {
  return typeof path === 'string' && /^\/home\/web_user\/_dl\/[^/\\\u0000-\u001f]+$/.test(path) && !path.split('/').includes('..');
}

/** Freeze the result once. Only a received entitlement can call deliver for exports. */
export function prepareDownload({ name, bytes, authorize, deliver }) {
  const safeName = fileName(name);
  const content = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  if (!content.size) throw new Error('O arquivo ainda está vazio.');
  const format = extension(safeName);
  const backup = isBackup(safeName);
  if (!backup && !EXPORT_FORMATS.has(format)) throw new Error('Este formato não está habilitado para exportação. Salve uma cópia FCStd para continuar no FreeCAD do computador.');
  let inFlight, delivered = false;
  const send = async () => { await deliver(content, safeName); delivered = true; };
  // The wallet binds an interrupted attempt to this exact frozen result. Keep
  // its identity when the file row retries, as well as its immutable bytes.
  const authorization = Object.freeze({ toolId: 'modelador-parametrico-3d', format, content, deliver: send });
  return { name: safeName, size: content.size, backup, async run() {
    if (delivered) return true;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (backup) { await send(); return true; }
      return authorize(authorization);
    })();
    try { return await inFlight; } finally { inFlight = undefined; }
  } };
}

/** Native save callbacks announce a path before the writer opens it. Wait for stability. */
export function createSaveWatcher({ fs, busy, onReady, onError }) {
  const pending = new Map();
  return {
    register(path) {
      if (!stagePath(path)) { onError(new Error('O destino do arquivo não é uma pasta de exportação válida.')); return false; }
      fs.mkdirTree('/home/web_user/_dl');
      let previous = '';
      try { const stat = fs.stat(path); previous = `${+stat.mtime}:${stat.size}`; } catch { /* first save */ }
      pending.set(path, { previous, candidate: '', ticks: 0 });
      return true;
    },
    tick() {
      if (busy()) return;
      for (const [path, entry] of pending) {
        try {
          // A yielding exporter may pause between writes. Never publish an open writer.
          if (fs.streams?.some(stream => stream?.path === path && (stream.flags & 3))) continue;
          const stat = fs.stat(path);
          const signature = `${+stat.mtime}:${stat.size}`;
          if (!stat.size || signature === entry.previous) continue;
          if (entry.candidate !== signature) { entry.candidate = signature; entry.ticks = 1; continue; }
          if (++entry.ticks < 3) continue;
          const bytes = fs.readFile(path).slice();
          if (bytes.length !== stat.size) { entry.ticks = 0; continue; }
          entry.previous = signature;
          entry.candidate = '';
          entry.ticks = 0;
          onReady({ path, name: path.split('/').pop(), bytes });
        } catch (error) {
          // A path that does not exist yet is normal. Other filesystem failures are visible.
          if (error?.errno !== 44) onError(error);
        }
      }
    },
  };
}
