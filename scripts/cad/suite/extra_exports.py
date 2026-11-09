"""Explicit export bridges for the ModelCraft and PartCraft add-ons.

These modules bypass the edition host's normal ``download`` API.  Keep each
replacement tied to one upstream call site: project snapshots remain backups,
while generated reports and fabrication artefacts go through the credit gate.
"""


def _once(text: str, before: str, after: str, label: str) -> str:
    """Replace an audited upstream fragment, rejecting silently-drifted code."""
    if text.count(before) != 1:
        raise ValueError(f"Unexpected upstream export call site: {label}")
    return text.replace(before, after)


def _import(url: str, names: str = "requestConfengeExport") -> str:
    return f"import {{ {names} }} from '{url}';\n"


def patch_extra_exports(slug: str, name: str, text: str, bridge_url: str) -> str | None:
    """Return an adapted JS module for ModelCraft/PartCraft, else ``None``.

    ``name`` deliberately remains the upstream archive path here.  The caller
    renames the revision after this function has selected the known module.
    """
    if slug not in {"modelcraft", "partcraft"}:
        return None

    if name.endswith("addons/flow/main.js") and slug == "modelcraft":
        before = """  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }"""
        after = """  function download(name, text, type) {
    // The editable flow layout is a backup; generated CSVs are paid exports.
    (name === 'layout.ccflow.json' ? requestConfengeBackup : requestConfengeExport)(text, name, type);
  }"""
        return _import(bridge_url, "requestConfengeExport, requestConfengeBackup") + _once(text, before, after, name)

    if name.endswith("addons/trusscraft/panel.js"):
        before = """    const download = (name, data, mime) => { const a = el('a', { download: name, href: URL.createObjectURL(new Blob([data], { type: mime })) }); d.body.append(a); a.click(); a.remove(); };"""
        after = """    const download = (name, data, mime) => requestConfengeExport(data, name, mime);"""
        return _import(bridge_url) + _once(text, before, after, name)

    if name.endswith("compute-mc.js") and slug == "modelcraft":
        before = """    download(name, text, type) {
      const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },"""
        after = """    download(name, text, type) {
      requestConfengeExport(text, name, type);
    },"""
        return _import(bridge_url) + _once(text, before, after, name)

    if name.endswith("print-split-ui.js") and slug == "modelcraft":
        before = """    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = file;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);"""
        after = """    requestConfengeExport(zip, file, 'application/zip');"""
        return _import(bridge_url) + _once(text, before, after, name)

    if name.endswith("addons/advanced-sim/main.js") and slug == "partcraft":
        before = """  const download = (name, text, mime = 'text/plain') => {
    const d = pane?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const a = d.createElement('a');
    a.download = name; a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    d.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };"""
        after = """  const download = (name, text, mime = 'text/plain') => requestConfengeExport(text, name, mime);"""
        return _import(bridge_url) + _once(text, before, after, name)

    if name.endswith("addons/magnetics/main.js") and slug == "partcraft":
        before = """    const d = pane?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (d && typeof URL !== 'undefined' && URL.createObjectURL) {
      const a = d.createElement('a');
      a.download = name; a.href = URL.createObjectURL(new Blob([text], { type: mime }));
      d.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }"""
        after = """    // A study JSON is an editable backup; solved outputs are exports.
    (kind === 'study' ? requestConfengeBackup : requestConfengeExport)(text, name, mime);"""
        return _import(bridge_url, "requestConfengeExport, requestConfengeBackup") + _once(text, before, after, name)

    if name == "assets/apps/partcraft/0.8.1/partcraft.js" and slug == "partcraft":
        before = """  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }"""
        after = """  function download(bytes, name, type) {
    requestConfengeExport(bytes, name, type);
  }"""
        text = _once(text, before, after, name)
        text = _once(
            text,
            "        saveBlob: (name, text, mime) => download(text, name, mime),",
            "        saveBlob: (name, text, mime) => requestConfengeBackup(text, name, mime),",
            name,
        )
        text = _once(
            text,
            "    download(A.toJSON(asm), name + '.partcraft-asm.json', 'application/json');",
            "    requestConfengeBackup(A.toJSON(asm), name + '.partcraft-asm.json', 'application/json');",
            name,
        )
        return _import(bridge_url, "requestConfengeExport, requestConfengeBackup") + text

    return None
