import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function qualifyImports({ page, python, reports, record }) {
  const results = {}, failures = [], fixtureErrors = new Map();
  const resetCapture = () => page.evaluate(() => {
    window.__freecadImportCapture.log = [];
    window.__freecadImportCapture.statuses = [];
  });
  const readCapture = () => page.evaluate(() => ({
    log: window.__freecadImportCapture.log,
    statuses: window.__freecadImportCapture.statuses,
    status: document.querySelector('#status').textContent,
    pythonBusy: Boolean(window.__fcPyBusy),
  }));
  // Preserve the actual native output for each importer, including exceptions.
  // The runtime's bounded help log is otherwise flooded by renderer messages.
  await page.evaluate(() => {
    const capture = { originalAppend: window.append, log: [], statuses: [] };
    window.__freecadImportCapture = capture;
    window.append = function (value, kind) {
      const text = String(value);
      if (!text.startsWith('[FCWEB-SW]')) {
        capture.log.push({ kind: String(kind || ''), text: text.slice(0, 4000) });
        if (capture.log.length > 200) capture.log.shift();
      }
      return capture.originalAppend.call(this, value, kind);
    };
    capture.observer = new MutationObserver(() => {
      const status = document.querySelector('#status');
      capture.statuses.push({ text: status.textContent, error: status.classList.contains('error') });
      if (capture.statuses.length > 50) capture.statuses.shift();
    });
    capture.observer.observe(document.querySelector('#status'), { childList: true, characterData: true, subtree: true, attributes: true });
  });

  const inspectModel = extension => python(`import FreeCAD as App
document=App.ActiveDocument
objects=document.Objects if document else []
bounds=[]
volumes=[]
edges={}
inventory=[]
valid=True
for obj in objects:
 item={'name':obj.Name,'label':obj.Label,'type':obj.TypeId,'state':[str(state) for state in obj.State]}
 try:
  if hasattr(obj,'Shape'):
   item['shapeNull']=obj.Shape.isNull()
   if not item['shapeNull']:
    item['shapeType']=obj.Shape.ShapeType
    item['faces']=len(obj.Shape.Faces)
    item['edges']=len(obj.Shape.Edges)
    bounds.append(obj.Shape.BoundBox)
    volumes.append(obj.Shape.Volume)
    valid=valid and obj.Shape.isValid()
    for edge in obj.Shape.Edges:
     key=tuple(sorted(tuple(round(c,6) for c in (v.Point.x,v.Point.y,v.Point.z)) for v in edge.Vertexes))
     edges[key]=edge.Length
  if hasattr(obj,'Mesh'):
   item['facets']=obj.Mesh.CountFacets
   if item['facets']:
    bounds.append(obj.Mesh.BoundBox)
    volumes.append(obj.Mesh.Volume)
 except Exception as error:
  item['inspectionError']=str(error)
  valid=False
 inventory.append(item)
proof={'document':document.Name if document else None,'documents':{name:len(doc.Objects) for name,doc in App.listDocuments().items()},'importers':App.getImportType(${JSON.stringify(extension)}),'objects':len(objects),'inventory':inventory,'geometry':len(bounds),'bounds':[max(getattr(b,axis+'Max') for b in bounds)-min(getattr(b,axis+'Min') for b in bounds) for axis in ['X','Y','Z']] if bounds else [],'volume':max(volumes) if volumes else 0,'valid':valid,'edgeLengths':sorted(edges.values())}`);

  try {
    // STEP/STL are the actual receipt-bound downloads. Generate the other two
    // native fixtures independently so one exporter cannot hide another format.
    for (const [extension, exporter] of [['iges', 'Part'], ['3mf', 'Mesh']]) {
      results[extension] = { ok: false };
      await resetCapture();
      try {
        const fixture = await python(`import FreeCAD as App, ${exporter}, base64
obj=App.ActiveDocument.getObject('Extrusao')
path='/tmp/confenge-import-fixture.${extension}'
${exporter}.export([obj],path)
with open(path,'rb') as source: encoded=base64.b64encode(source.read()).decode('ascii')
proof={'encoded':encoded,'document':obj.Document.Name,'object':obj.Name,'sourceVolume':obj.Shape.Volume}`);
        const bytes = Buffer.from(fixture.encoded, 'base64');
        assert.ok(bytes.length > 100, `native ${extension} fixture must contain geometry`);
        assert.ok(Math.abs(fixture.sourceVolume - 288000) < 0.1, `${extension} fixture must use the original parametric solid`);
        await writeFile(join(reports, 'example.' + extension), bytes);
        results[extension].fixture = { exporter, bytes: bytes.length, document: fixture.document, object: fixture.object, sourceVolume: fixture.sourceVolume };
      } catch (error) {
        fixtureErrors.set(extension, error);
      }
      results[extension].fixtureDiagnostics = await readCapture();
    }
    // Independent, dimensioned 2D input examples in millimetres.
    const dxf = ['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
    const corners = [[0,0],[100,0],[100,60],[0,60]];
    for (let index = 0; index < corners.length; index++) {
      const a = corners[index], b = corners[(index + 1) % corners.length];
      dxf.push('0','LINE','8','0','10',String(a[0]),'20',String(a[1]),'30','0','11',String(b[0]),'21',String(b[1]),'31','0');
    }
    dxf.push('0','ENDSEC','0','EOF');
    await writeFile(join(reports, 'example.dxf'), dxf.join('\n') + '\n');
    await writeFile(join(reports, 'example.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"><rect x="0" y="0" width="100" height="60" fill="none" stroke="black" stroke-width="0.1"/></svg>');

    for (const extension of ['step','iges','stl','3mf','dxf','svg']) {
      const result = results[extension] ||= { ok: false };
      result.stage = 'fixture';
      await resetCapture();
      try {
        if (fixtureErrors.has(extension)) throw fixtureErrors.get(extension);
        result.stage = 'open';
        await python("import FreeCAD as App\nfor name in list(App.listDocuments()): App.closeDocument(name)\nproof={'closed':True}");
        // Reset after closing documents so an old terminal status cannot make
        // the next import appear complete before its change handler has run.
        await resetCapture();
        const chooser = page.waitForFileChooser();
        await page.click('#open');
        await (await chooser).accept([join(reports, 'example.' + extension)]);
        await page.waitForFunction(() => {
          const status = document.querySelector('#status');
          return window.__freecadImportCapture.statuses.length > 0 && !window.__fcPyBusy
            && (status.textContent.startsWith('Modelo aberto.') || status.classList.contains('error'));
        }, { timeout: 90000 });
        result.status = await page.$eval('#status', element => element.textContent);
        result.stage = 'inspect';
        const model = result.model = await inspectModel(extension);
        assert.match(result.status, /^Modelo aberto\./, `opening ${extension} must finish without an importer error`);
        result.stage = 'geometry';
        assert.ok(model.geometry > 0, `${extension} must produce actual geometry`);
        assert.equal(model.valid, true, `${extension} must not create an invalid native shape`);
        const expected = ['dxf','svg'].includes(extension) ? [100,60,0] : [120,60,40];
        assert.equal(model.bounds.length, 3, `${extension} must have measurable extents on all three axes`);
        model.bounds.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 0.01,
          `${extension} ${'XYZ'[index]} extent ${value} must equal ${expected[index]} mm`));
        if (['step','stl','3mf'].includes(extension)) assert.ok(Math.abs(model.volume - 288000) < 0.1,
          `${extension} must preserve the exported solid's scale and volume`);
        if (['dxf','svg'].includes(extension)) {
          assert.equal(model.edgeLengths.length, 4, `${extension} must preserve all four rectangle edges`);
          model.edgeLengths.forEach((length, index) => assert.ok(Math.abs(length - [60,60,100,100][index]) < 0.01,
            `${extension} must preserve the full 320 mm rectangle perimeter`));
        }
        result.ok = true;
        result.stage = 'complete';
        record(`${extension.toUpperCase()} opens through the CONFENGE file picker with verified geometry and millimetre scale`);
      } catch (error) {
        result.error = String(error.stack || error);
        failures.push({ format: extension, stage: result.stage, error: result.error });
      } finally {
        result.diagnostics = await readCapture().catch(error => ({ error: String(error) }));
        if (!result.model && !fixtureErrors.has(extension) && result.diagnostics.pythonBusy === false) {
          result.model = await inspectModel(extension).catch(error => ({ inspectionError: String(error) }));
        }
        await writeFile(join(reports, 'imports.json'), JSON.stringify({ results, failures }, null, 2));
      }
    }
    return { results, failures };
  } finally {
    await page.evaluate(() => {
      const capture = window.__freecadImportCapture;
      capture.observer.disconnect();
      window.append = capture.originalAppend;
      delete window.__freecadImportCapture;
    }).catch(() => {});
  }
}
