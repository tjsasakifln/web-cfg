"""Rebuild the MIT sldeditor compiler and local symbols. Requires git and esbuild 0.25.12."""
from pathlib import Path
import subprocess
import tempfile

SOURCE = 'https://github.com/NovaShang/sldeditor.git'
COMMIT = '180e0918cb596738b6326c3a55576f55e08170c4'
KINDS = ['grid-source','breaker','rcd','disconnector','fuse','generator',
         'transformer-2w','energy-meter','luminaire','load','earth']
OUT = Path(__file__).resolve().parents[2] / 'ferramentas/diagrama-unifilar/vendor/sld.js'

with tempfile.TemporaryDirectory() as work:
    root = Path(work) / 'upstream'
    subprocess.run(['git','clone','--no-checkout',SOURCE,str(root)],check=True)
    subprocess.run(['git','-C',str(root),'checkout','--detach',COMMIT],check=True)
    # Substitute the Vite glob with explicit imports; only these symbols ship.
    imports = '\n'.join(f"import s{i} from './{kind}.json';" for i,kind in enumerate(KINDS))
    names = ','.join('s'+str(i) for i in range(len(KINDS)))
    (root/'src/element-library/index.ts').write_text(imports+'\nexport const libraryById=Object.fromEntries(['+names+'].map(s=>[s.id,s]));\n')
    # Host displays its own localized diagnostics; don't import the React store.
    (root/'src/i18n/index.ts').write_text("export const t=(key, params)=>key+' '+JSON.stringify(params);\n")
    (root/'entry.ts').write_text("export { compile } from './src/compiler/compile';\nexport { LIBRARY } from './src/compiler/library-index';\n")
    subprocess.run(['esbuild','entry.ts','--bundle','--minify','--target=es2020',
                    '--format=esm','--outfile='+str(OUT)],cwd=root,check=True)
