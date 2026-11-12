"""Install the pinned, independently hosted CONFENGE edition of OpenCAD Studio."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile

PACKAGE = Path(__file__).resolve().parent / 'opencad'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def checked(path, expected):
    if not re.fullmatch(r'[a-f0-9]{64}', expected) or sha256(path) != expected:
        raise ValueError(f'Hash incorreto no pacote CAD: {path.name}')
    return path


def assemble(record, destination):
    """Every chunk and the assembled archive are pinned. No network at build time."""
    parts = record.get('parts') or [{'file': record['archive'], 'sha256': record['sha256']}]
    with destination.open('wb') as target:
        for item in parts:
            name = item['file']
            if Path(name).name != name:
                raise ValueError('Caminho inválido no pacote CAD.')
            source = checked(PACKAGE / name, item['sha256'])
            with source.open('rb') as stream:
                shutil.copyfileobj(stream, target)
    checked(destination, record['sha256'])


def extract_runtime(archive, destination, expected):
    found = set()
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            name = member.name.removeprefix('./')
            path = PurePosixPath(name)
            if member.isdir():
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError('Diretório inválido no pacote CAD.')
                continue
            if (not member.isfile() or path.is_absolute() or '..' in path.parts or
                    '\\' in name or name not in expected or name in found or
                    member.size > 256 * 1024 * 1024):
                raise ValueError(f'Recurso inesperado no pacote CAD: {name}')
            found.add(name)
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as stream, target.open('wb') as output:
                shutil.copyfileobj(stream, output)
            checked(target, expected[name])
    if found != set(expected):
        raise ValueError('O pacote CAD está incompleto.')


def install(output):
    receipt = json.loads((PACKAGE / 'manifest.json').read_text(encoding='utf-8'))
    if receipt['engine'] != 'OpenCAD Studio':
        raise ValueError('Motor CAD divergente do contrato.')
    editor = output / 'cad' / 'editor'
    editor.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='confenge-opencad-') as temporary:
        stage = Path(temporary)
        runtime = stage / 'runtime.tar.gz'
        assemble(receipt['runtime'], runtime)
        extracted = stage / 'runtime'
        extract_runtime(runtime, extracted, receipt['runtime']['files'])
        for path in sorted(extracted.rglob('*')):
            if path.is_file():
                target = editor / path.relative_to(extracted)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        source = stage / 'corresponding-source.tar.gz'
        assemble(receipt['source'], source)
        licenses = editor / 'licencas'
        licenses.mkdir(exist_ok=True)
        # Temporary and artifact directories can live on different volumes.
        shutil.copyfile(source, licenses / 'corresponding-source.tar.gz')
    shutil.copyfile(PACKAGE / 'LICENSE.txt', licenses / 'GPL-3.0.txt')
    shutil.copyfile(PACKAGE / 'NOTICE.txt', licenses / 'fontes-e-codigo.txt')
    # The release record exposes only provenance and hashes, never visitor data.
    (editor / 'runtime.json').write_text(json.dumps({
        'engine': receipt['engine'], 'version': receipt['version'],
        'upstream': receipt['upstream'], 'runtime_sha256': receipt['runtime']['sha256'],
        'source_sha256': receipt['source']['sha256'],
        'source': '/cad/editor/licencas/corresponding-source.tar.gz',
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for name in ['sw.js', 'app.webmanifest', 'locale-labels.json']:
        (editor / name).unlink(missing_ok=True)


def version_editor_assets(output):
    links = {
        'editor/ocs-parse-worker.js': ['./worker_pkg/ocs_web_worker.js?v=5', './worker_pkg/ocs_web_worker_bg.wasm?v=5'],
        'editor/start.js': ['./confenge-cad.js', './confenge-cad_bg.wasm', './ocs-control.js'],
        'editor/frame.htm': ['./start.js', './frame.css'],
        'editor.js': ['./host-protocol.mjs', '/cad/editor/frame.htm'],
        'index.html': ['/cad/editor.js'],
    }
    for parent, children in links.items():
        path = output / 'cad' / parent
        text = path.read_text(encoding='utf-8')
        for url in children:
            filename = url.split('?', 1)[0]
            asset = output / filename.lstrip('/') if filename.startswith('/') else path.parent / filename
            digest = sha256(asset)[:16]
            # Replace upstream's fixed worker version as well as a previous build hash.
            pattern = re.escape(url) + r'(?:[?&]v=[a-f0-9]+)?(?=[\'\"])'
            replacement = filename + '?v=' + digest
            text, count = re.subn(pattern, replacement, text)
            if not count:
                raise ValueError(f'Referência CAD ausente: {parent} -> {url}')
        path.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    output = Path(sys.argv[1]).resolve()
    install(output)
    version_editor_assets(output)
