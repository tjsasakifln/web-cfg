import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function qualifyImports({ page, python, reports, record }) {
  // The STEP/STL fixtures are the actual receipt-bound downloads. Produce the
  // additional interchange fixtures with native exporters before closing the
  // editable model; DXF/SVG below are independent, dimensioned input examples.
  const interchange = await python(`import FreeCAD as App, Part, Mesh, base64
obj=App.ActiveDocument.getObject('Extrusao')
proof={}
for extension, exporter in [('iges',Part),('3mf',Mesh)]:
 path='/tmp/confenge-import-fixture.'+extension
 exporter.export([obj],path)
 with open(path,'rb') as source: proof[extension]=base64.b64encode(source.read()).decode('ascii')`);
  for (const [extension, bytes] of Object.entries(interchange)) {
    assert.ok(bytes.length > 100, `native ${extension} fixture must contain geometry`);
    await writeFile(join(reports, 'example.' + extension), Buffer.from(bytes, 'base64'));
  }
  const dxf = ['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
  const corners = [[0,0],[100,0],[100,60],[0,60]];
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index], b = corners[(index + 1) % corners.length];
    dxf.push('0','LINE','8','0','10',String(a[0]),'20',String(a[1]),'30','0','11',String(b[0]),'21',String(b[1]),'31','0');
  }
  dxf.push('0','ENDSEC','0','EOF');
  await writeFile(join(reports, 'example.dxf'), dxf.join('\n') + '\n');
  await writeFile(join(reports, 'example.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60"><rect x="0" y="0" width="100" height="60" fill="none" stroke="black" stroke-width="0.1"/></svg>');

  const evidence = {};
  for (const extension of ['step','iges','stl','3mf','dxf','svg']) {
    await python("import FreeCAD as App\nfor name in list(App.listDocuments()): App.closeDocument(name)\nproof={'closed':True}");
    const chooser = page.waitForFileChooser();
    await page.click('#open');
    await (await chooser).accept([join(reports, 'example.' + extension)]);
    await page.waitForFunction(() => {
      const status = document.querySelector('#status');
      return status.textContent.startsWith('Modelo aberto.') || status.classList.contains('error');
    }, { timeout: 90000 });
    assert.match(await page.$eval('#status', element => element.textContent), /^Modelo aberto\./, `opening ${extension} must finish without an importer error`);
    const model = await python(`import FreeCAD as App
objects=App.ActiveDocument.Objects
bounds=[]
volumes=[]
edges={}
valid=True
for obj in objects:
 if hasattr(obj,'Shape') and not obj.Shape.isNull():
  bounds.append(obj.Shape.BoundBox)
  volumes.append(obj.Shape.Volume)
  valid=valid and obj.Shape.isValid()
  for edge in obj.Shape.Edges:
   key=tuple(sorted(tuple(round(c,6) for c in (v.Point.x,v.Point.y,v.Point.z)) for v in edge.Vertexes))
   edges[key]=edge.Length
 if hasattr(obj,'Mesh') and obj.Mesh.CountFacets:
  bounds.append(obj.Mesh.BoundBox)
  volumes.append(obj.Mesh.Volume)
proof={'objects':len(objects),'geometry':len(bounds),'bounds': [max(getattr(b,axis+'Max') for b in bounds)-min(getattr(b,axis+'Min') for b in bounds) for axis in ['X','Y','Z']] if bounds else [],'volume':max(volumes) if volumes else 0,'valid':valid,'edgeLengths':sorted(edges.values())}`);
    assert.ok(model.geometry > 0, `${extension} must produce actual geometry`);
    assert.equal(model.valid, true, `${extension} must not create an invalid native shape`);
    const expected = ['dxf','svg'].includes(extension) ? [100,60,0] : [120,60,40];
    model.bounds.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 0.01,
      `${extension} ${'XYZ'[index]} extent ${value} must equal ${expected[index]} mm`));
    if (['step','stl','3mf'].includes(extension)) assert.ok(Math.abs(model.volume - 288000) < 0.1,
      `${extension} must preserve the exported solid's scale and volume`);
    if (['dxf','svg'].includes(extension)) {
      assert.equal(model.edgeLengths.length, 4, `${extension} must preserve all four rectangle edges`);
      model.edgeLengths.forEach((length, index) => assert.ok(Math.abs(length - [60,60,100,100][index]) < 0.01,
        `${extension} must preserve the full 320 mm rectangle perimeter`));
    }
    evidence[extension] = model;
    record(`${extension.toUpperCase()} opens through the CONFENGE file picker with verified geometry and millimetre scale`);
  }
  return evidence;
}
