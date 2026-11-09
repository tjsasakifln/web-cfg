"""Adapt the pinned Apache-2.0 editions at build time. Keep technical IDs and notice files."""
from base64 import b64encode
from hashlib import file_digest, sha256
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

ROOT = Path(__file__).resolve().parents[3]
NAMES = {
    "CadCraft": "CONFENGE CAD 2D", "BimCraft": "CONFENGE BIM", "CivilCraft": "CONFENGE Civil",
    "DetailCraft": "CONFENGE Detalhamento", "MarkupCraft": "CONFENGE Revisão",
    "ModelCraft": "CONFENGE Modelagem", "PartCraft": "CONFENGE Peças", "TakeoffCraft": "CONFENGE Quantitativos",
}
SOURCE_NAMES = {name.lower(): name for name in NAMES}
BRANDS = re.compile(r'(?<![A-Za-z0-9_.])(' + '|'.join(NAMES) + r')(?![A-Za-z0-9_]|\.[A-Za-z0-9_])')
ICON = (ROOT / 'assets/favicon-32.png').read_bytes()
ICO = (ROOT / 'favicon.ico').read_bytes()
REV = '0.8.1-confenge-' + sha256(Path(__file__).read_bytes() + ICON + ICO).hexdigest()[:12]
CREDIT = "CONFENGE adaptou a interface, os nomes, a ajuda e os recursos offline desta edição. "

EXPORT_BRIDGE = r"""// Entitlement bridge for the CONFENGE browser edition. No login token enters this frame.
const pending = new Map();
let unavailable = false;

function request(kind, data, name, type) {
  const safeName = String(name || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 200);
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  if (unavailable || window.parent === window || !safeName || !blob.size) return false;
  const requestId = crypto.randomUUID();
  const timeout = setTimeout(() => {
    pending.delete(requestId);
    unavailable = true;
    window.dispatchEvent(new CustomEvent('confenge-export-error', { detail: { code: 'BRIDGE_UNAVAILABLE' } }));
  }, 30000);
  pending.set(requestId, { blob, name: safeName, timeout });
  window.parent.postMessage({
    type: 'confenge-suite-export', version: 1, kind, requestId,
    name: safeName, mime: blob.type || String(type || ''), size: blob.size, content: blob,
  }, location.origin);
  return true;
}

export const requestConfengeExport = (data, name, type) => request('export', data, name, type);
export const requestConfengeBackup = (data, name, type) => request('backup', data, name, type);

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'confenge-suite-export-result') return;
  const job = pending.get(event.data.requestId);
  if (!job) return;
  clearTimeout(job.timeout);
  pending.delete(event.data.requestId);
  if (event.data.status === 'unavailable') unavailable = true;
});
"""


def display(text):
    return BRANDS.sub(lambda m: NAMES[m[1]], text)


def replace_one(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Unexpected edition source: {before[:100]}')
    return text.replace(before, after)


def bridge_import(slug, names='requestConfengeExport'):
    url = f'/cad/suite/runtime/{slug}/assets/apps/{slug}/{REV}/confenge-export.js'
    return f"import {{ {names} }} from '{url}';\n"


def offline_worker(text):
    text = replace_one(text, "const PREFIX = 'cc-edition:' + SCOPE.pathname + '@';",
                       "const LEGACY = 'cc-edition:' + SCOPE.pathname + '@';\n"
                       "const FAMILY = 'confenge-edition:' + SCOPE.pathname + '@';\n"
                       f"const PREFIX = FAMILY + '{REV}:';\n"
                       "const previous = async () => (await caches.keys()).filter(k => k.startsWith(LEGACY) || "
                       "(k.startsWith(FAMILY) && !k.startsWith(PREFIX)));")
    text = replace_one(text, "reply({ type: 'status', key, saved: when !== null, when });",
                       "reply({ type: 'status', key, saved: when !== null, when, migrate: when === null && (await previous()).length > 0 });")
    text = replace_one(text, "const older = await ours();", "const older = [...await ours(), ...await previous()];")
    text = replace_one(text, "for (const k of await ours()) await caches.delete(k);",
                       "for (const k of [...await ours(), ...await previous()]) await caches.delete(k);")
    text = replace_one(text, 'async function saved(req, loose = true) {\n  for (const k of await ours()) {',
                       'async function saved(req, loose = true, older = false) {\n  for (const k of older ? await previous() : await ours()) {')
    text = replace_one(text, 'if (copy) return copy.hit;',
                       'const fallback = copy || await saved(new Request(page), true, true);\n        if (fallback) return fallback.hit;')
    text = replace_one(text, 'const near = await saved(req);',
                       'const near = await saved(req) || await saved(req, true, true);')
    return text


def offline_ui(text):
    text = replace_one(text, "savedAt = m.when;", "savedAt = m.when;\n      if (m.migrate && navigator.onLine) { save(); return; }")
    # ready can still point at the previous worker if the user saved the upstream edition.
    text = replace_one(text, "return navigator.serviceWorker.ready;", """return navigator.serviceWorker.ready.then(function(reg) {
      var next = reg.installing || reg.waiting;
      if (!next || next.state === 'activated') return reg;
      return new Promise(function(resolve, reject) {
        next.addEventListener('statechange', function() {
          if (next.state === 'activated') resolve(reg);
          if (next.state === 'redundant') reject(new Error('worker update'));
        });
      });
    });""")
    return replace_one(text, "btn.classList.remove('is-offline');", "btn.classList.remove('is-offline'); if (state !== 'saving') send({type:'status', key:data.key});")


def adapted(slug, name, data):
    source = SOURCE_NAMES[slug]
    old = f'assets/apps/{slug}/0.8.1/'
    new = f'assets/apps/{slug}/{REV}/'
    path = name.replace(old, new)
    if name == 'favicon.svg':
        encoded = b64encode(ICON).decode()
        return path, (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image width="32" height="32" href="data:image/png;base64,{encoded}"/></svg>').encode()
    if name == 'favicon-32.png':
        return path, ICON
    if name == 'favicon.ico':
        return path, ICO
    if name == 'NOTICE':
        return path, data + ('\n' + CREDIT + '\n').encode()
    if name == 'index.html':
        text = data.decode().replace(old, new)
        text = replace_one(text, '"version":"0.8.1","site":"https://getcadcraft.com"', f'"version":"{REV}","site":"https://confenge.com.br"')
        text = replace_one(text, '"sw":"sw.js","scope":"./","urls":[',
                           f'"sw":"sw.js?v={REV}","scope":"./","urls":["creditos.html","LICENSE","NOTICE","TRADEMARKS.md","THIRD_PARTY.md","{new}confenge-export.js",')
        text = replace_one(text, './favicon.svg', f'./favicon-32.png?v={REV}').replace('type="image/svg+xml"', 'type="image/png"', 1)
        text = replace_one(text, '<i class="bi bi-bounding-box"></i></span>', f'<img width="28" height="28" src="./favicon-32.png?v={REV}" alt=""></span>')
        text = replace_one(text, f'<span>{source}</span>', f'<span><a href="./creditos.html" target="_blank" rel="noopener" title="Sobre e licenças" style="color:inherit;text-decoration:none">{source}</a></span>')
        text = replace_one(text, f'<a href="https://getcadcraft.com/apps/{slug}" target="_blank" rel="noopener">About {source}</a>',
                           '<a href="./creditos.html" target="_blank" rel="noopener">Sobre e licenças</a>')
        text = text.replace('>Browser edition</span>', '>Edição web</span>')
        text = text.replace('<head>', '<head>\n  <!-- Interface adaptada pela CONFENGE. Consulte creditos.html. -->', 1)
        # Display names use title case. Technical identifiers (app, keys, formats, paths) use lowercase.
        return path, display(text).encode()
    if name == 'sw.js':
        return path, ('// Offline adaptado pela CONFENGE.\n' + offline_worker(data.decode())).encode()
    if name == 'assets/js/app-workspace.js':
        # Docked workspaces render their own header and hide the initial app bar.
        text = replace_one(data.decode(), "const brand = el('span', { className: 'ws-brand' }",
                           "const brand = el('a', { className: 'ws-brand', href:'./creditos.html', target:'_blank', rel:'noopener', title:'Sobre e licenças', style:'color:inherit;text-decoration:none' }")
        return path, ('// Link de créditos da edição CONFENGE.\n' + text).encode()
    if name == 'assets/js/app-offline.js':
        return path, ('// Atualização offline adaptada pela CONFENGE.\n' + offline_ui(data.decode())).encode()
    if name == f'assets/apps/{slug}/0.8.1/host.js':
        text = data.decode()
        text = "import { requestConfengeExport, requestConfengeBackup } from './confenge-export.js';\n" + text
        text = replace_one(text, '    this.download(data, name, type);\n    await this.recent.add(',
                           '    this.downloadLocal(data, name, type);\n    await this.recent.add(')
        before = """    if (this.desktop) { this.saveAs({ data, name, type }); return; }
    const d = this.doc;
    if (!d || typeof URL === 'undefined' || !URL.createObjectURL) return;
    const url = URL.createObjectURL(toBlob(data, type));
    const a = d.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    d.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);"""
        after = """    if (this.desktop) { this.saveAs({ data, name, type }); return; }
    requestConfengeExport(data, name, type);"""
        text = replace_one(text, before, after)
        text = replace_one(text, '  // ---------------------------------------------------------------- folders (W2.12: sheet sets)',
                           """  downloadLocal(data, name, type) {
    requestConfengeBackup(data, name, type);
  }

  // ---------------------------------------------------------------- folders (W2.12: sheet sets)""")
        return path, text.encode()
    if name == f'assets/apps/{slug}/0.8.1/ui-util.js' and slug in ('markupcraft', 'takeoffcraft'):
        text = "import { requestConfengeExport } from './confenge-export.js';\n" + data.decode()
        if slug == 'markupcraft':
            before = r"""  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name.replace(/[\\/:*?"<>|]+/g, '_') });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);"""
        else:
            before = """  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);"""
        text = replace_one(text, before, '  requestConfengeExport(data, name, type);')
        return path, text.encode()
    if name == f'assets/apps/{slug}/0.8.1/addons/cabinetcraft/main.js':
        text = "import { requestConfengeExport, requestConfengeBackup } from '../../confenge-export.js';\n" + data.decode()
        before = """  const download = (name, data, mime) => {
    const d = pane?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const a = d.createElement('a');
    a.download = name; a.href = URL.createObjectURL(new Blob([data], { type: mime || 'text/plain' }));
    d.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };"""
        after = """  const download = (name, data, mime) => requestConfengeExport(data, name, mime);
  const backup = (name, data, mime) => requestConfengeBackup(data, name, mime);"""
        text = replace_one(text, before, after)
        text = replace_one(text, '    download,\n', '    download, backup,\n')
        return path, text.encode()
    if name == f'assets/apps/{slug}/0.8.1/addons/cabinetcraft/lib/ui.js':
        text = data.decode()
        text = replace_one(text, "app.download((p.name || 'job') + '.cabinetcraft.json', X.jobJson(p), 'application/json')",
                           "app.backup((p.name || 'job') + '.cabinetcraft.json', X.jobJson(p), 'application/json')")
        return path, text.encode()
    if slug in ('bimcraft', 'cadcraft', 'civilcraft') and name in (
            f'assets/apps/{slug}/0.8.1/addons/plant/main.js',
            f'assets/apps/{slug}/0.8.1/addons/trusscraft/panel.js'):
        text = bridge_import(slug) + data.decode()
        before = "const download = (name, data, mime) => { const a = el('a', { download: name, href: URL.createObjectURL(new Blob([data], { type: mime })) }); d.body.append(a); a.click(); a.remove(); };"
        text = replace_one(text, before, "const download = (name, data, mime) => requestConfengeExport(data, name, mime);")
        return path, text.encode()
    if slug in ('bimcraft', 'cadcraft', 'civilcraft', 'detailcraft') and name == f'assets/apps/{slug}/0.8.1/addons/regs/lib/ui.js':
        text = bridge_import(slug) + data.decode()
        text = replace_one(text, r"""    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.bytes], { type: 'application/pdf' }));
    a.download = ((host.modelName() || 'drawing').replace(/\.[a-z0-9]+$/i, '')) + ' - ' + t('regs.sheet.pdf.file') + '.pdf';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);""",
                           r"""    const name = ((host.modelName() || 'drawing').replace(/\.[a-z0-9]+$/i, '')) + ' - ' + t('regs.sheet.pdf.file') + '.pdf';
    requestConfengeExport(out.bytes, name, 'application/pdf');""")
        text = replace_one(text, r"""    const html = sheetHtml(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = ((host.modelName() || 'drawing').replace(/\.[a-z0-9]+$/i, '')) + ' - ' + t('regs.sheet.file') + '.html';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);""",
                           r"""    const html = sheetHtml();
    const name = ((host.modelName() || 'drawing').replace(/\.[a-z0-9]+$/i, '')) + ' - ' + t('regs.sheet.file') + '.html';
    requestConfengeExport(html, name, 'text/html');""")
        return path, text.encode()
    if name == f'assets/apps/{slug}/0.8.1/register-ui.js' and slug in ('bimcraft', 'cadcraft'):
        text = bridge_import(slug) + data.decode()
        before = "const download = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };"
        text = replace_one(text, before, "const download = (blob, name) => requestConfengeExport(blob, name, blob.type);")
        return path, text.encode()
    if name == 'assets/apps/bimcraft/0.8.1/views-ui-bim.js':
        text = bridge_import(slug) + data.decode()
        before = "const file = (name, text, type) => { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };"
        text = replace_one(text, before, "const file = (name, text, type) => requestConfengeExport(text, name, type);")
        return path, text.encode()
    if name == 'assets/apps/cadcraft/0.8.1/params-panel.js':
        text = bridge_import(slug) + data.decode()
        before = """  host.download = (name, data, mime) => {
    const a = el('a', { href: URL.createObjectURL(new Blob([data], { type: mime || 'application/octet-stream' })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };"""
        text = replace_one(text, before, "  host.download = (name, data, mime) => requestConfengeExport(data, name, mime || 'application/octet-stream');")
        return path, text.encode()
    if name == 'assets/apps/cadcraft/0.8.1/libpanel.js':
        text = bridge_import(slug) + data.decode()
        text = replace_one(text, """      const a = el('a', { href: URL.createObjectURL(new Blob([creditsCsv(uses)], { type: 'text/csv' })), download: t('lib.panel.credits_file', { name: doc.meta.name || 'Drawing1' }) });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);""",
                           "      requestConfengeExport(creditsCsv(uses), t('lib.panel.credits_file', { name: doc.meta.name || 'Drawing1' }), 'text/csv');")
        text = replace_one(text, """      const a = el('a', { href: URL.createObjectURL(new Blob([partsCsv(rows)], { type: 'text/csv' })), download: t('lib.panel.parts_file', { name: doc.meta.name || 'Drawing1' }) });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);""",
                           "      requestConfengeExport(partsCsv(rows), t('lib.panel.parts_file', { name: doc.meta.name || 'Drawing1' }), 'text/csv');")
        return path, text.encode()
    if name == 'assets/apps/civilcraft/0.8.1/site-view3d.js':
        text = bridge_import(slug) + data.decode()
        before = """    const a = el('a', { href: URL.createObjectURL(new Blob([bytes], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);"""
        text = replace_one(text, before, "    requestConfengeExport(bytes, name, type);")
        return path, text.encode()
    if name == 'assets/apps/civilcraft/0.8.1/storm-route-ui.js':
        text = bridge_import(slug) + data.decode()
        before = r"""    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + hydrographCsv(r, id, U())], { type: 'text/csv' })), download: (name || 'outlet').replace(/[^\w.-]+/g, '-') + '-hydrograph.csv' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); ctx.say(t('rt.saved'));"""
        after = r"""    const file = (name || 'outlet').replace(/[^\w.-]+/g, '-') + '-hydrograph.csv';
    requestConfengeExport('﻿' + hydrographCsv(r, id, U()), file, 'text/csv'); ctx.say(t('rt.saved'));"""
        text = replace_one(text, before, after)
        return path, text.encode()
    if name == 'assets/js/app-ai-activity.js':
        text = bridge_import(slug, 'requestConfengeBackup') + data.decode()
        before = """    const url = URL.createObjectURL(new Blob([x.text], { type: x.type }));
    const a = h('a', { href: url, download: x.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);"""
        text = replace_one(text, before, "    requestConfengeBackup(x.text, x.name, x.type);")
        return path, text.encode()
    if name == 'assets/js/app-devices-ui.js':
        text = bridge_import(slug, 'requestConfengeBackup') + data.decode()
        before = """      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'my-devices.ccdevices.json'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);"""
        text = replace_one(text, before, "      requestConfengeBackup(text, 'my-devices.ccdevices.json', 'application/json');")
        return path, text.encode()
    if name == 'assets/js/app-settings.js':
        text = bridge_import(slug, 'requestConfengeBackup') + data.decode()
        before = """      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x.text], { type: 'application/json' })); a.download = x.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);"""
        text = replace_one(text, before, "      requestConfengeBackup(x.text, x.name, 'application/json');")
        before = """        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = (x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'environment') + '.ccenv.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);"""
        after = """        var fileName = (x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'environment') + '.ccenv.json';
        requestConfengeBackup(text, fileName, 'application/json');"""
        text = replace_one(text, before, after)
        return path, text.encode()
    if name == 'assets/apps/detailcraft/0.8.1/detailcraft.js':
        text = replace_one(data.decode(), "+ model.state.name + ' — DetailCraft'", "+ model.state.name + ' — CONFENGE Detalhamento'")
        return path, ('// Título de janela adaptado pela CONFENGE.\n' + text).encode()
    if name == 'release.json':
        meta = json.loads(data)
        meta['name'] = NAMES[source]
        meta['upstream'] = {'release': meta['release'], 'zip': meta.pop('zip'), 'tag': meta['tag']}
        meta['edition_revision'] = REV
        meta['changes_to_copied_files'].append(CREDIT.strip())
        for key in ('files', 'bytes_before_this_file'):
            meta.pop(key, None)
        return path, json.dumps(meta, ensure_ascii=False, indent=2).encode()
    # Work on UI catalogs and compiled manuals, not vendor source, file formats or plug-in APIs.
    is_catalog = '/lang/' in name and name.endswith('.json')
    is_help = '/help/' in name and name.endswith(('.md', '.js'))
    if is_catalog or is_help:
        text = display(data.decode())
        # The PDF is present in editions that publish this link in their manual.
        text = text.replace(f'https://getcadcraft.com/assets/apps/{slug}/current/',
                            f'/cad/suite/runtime/{slug}/{new}')
        if text != data.decode():
            if is_catalog:
                text = text.replace('{', '{"@confenge":"Interface adaptada pela CONFENGE.",', 1)
            elif name.endswith('.js'):
                text = '// Ajuda adaptada pela CONFENGE.\n' + text
            else:
                text = '<!-- Ajuda adaptada pela CONFENGE. -->\n' + text
            return path, text.encode()
    if old.encode() in data and not name.startswith('assets/vendor/') and name.endswith(('.js', '.json', '.css')):
        return path, data.replace(old.encode(), new.encode())
    return path, data


def credits(slug):
    name = NAMES[SOURCE_NAMES[slug]]
    return f"""<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sobre {name}</title><style>body{{font:1rem/1.6 system-ui,sans-serif;max-width:44rem;margin:8vh auto;padding:0 1.4rem;color:#172b27}}a{{color:#075a3d}}</style>
<main><img src="./favicon-32.png" width="32" height="32" alt=""><h1>{name}</h1>
<p>{CREDIT}Baseado em {SOURCE_NAMES[slug]} 0.8.1, de The Data Design Group, Inc., distribuído sob Apache License 2.0.</p>
<p><a href="./LICENSE">Licença do código</a> · <a href="./NOTICE">Avisos de autoria</a> · <a href="./THIRD_PARTY.md">Bibliotecas</a> · <a href="./TRADEMARKS.md">Marcas</a></p>
<p><a href="/cad/aplicativos/#{slug}">Voltar aos aplicativos CONFENGE</a></p></main></html>""".encode()


def build_archive(slug, archive, target):
    prefix = f'{slug}-browser-edition-v0.8.1/'
    with NamedTemporaryFile(dir=target, delete=False) as tmp:
        path = Path(tmp.name)
    try:
        with ZipFile(archive) as src, ZipFile(path, 'w', ZIP_DEFLATED, compresslevel=4) as dst:
            for member in src.infolist():
                if member.is_dir():
                    continue
                if not member.filename.startswith(prefix):
                    raise ValueError(member.filename)
                name, data = adapted(slug, member.filename[len(prefix):], src.read(member))
                info = ZipInfo(prefix + name, member.date_time)
                dst.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=4)
            info = ZipInfo(prefix + 'creditos.html', (2026, 11, 7, 0, 0, 0))
            dst.writestr(info, credits(slug), compress_type=ZIP_DEFLATED)
            info = ZipInfo(prefix + f'assets/apps/{slug}/{REV}/confenge-export.js', (2026, 11, 9, 0, 0, 0))
            dst.writestr(info, EXPORT_BRIDGE.encode(), compress_type=ZIP_DEFLATED)
        with path.open('rb') as src:
            digest = file_digest(src, 'sha256').hexdigest()
        result = target / f'{slug}-{digest[:16]}.zip'
        path.chmod(0o644)
        path.replace(result)
        return result
    finally:
        path.unlink(missing_ok=True)
