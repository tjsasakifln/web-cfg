import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Exercise native QActions, not the CONFENGE wrapper buttons or a synthetic FS.
// Pinned implementation: Virtastic/freecad-web v1.0.9, patches/freecad.patch,
// Gui/FileDialog.cpp: getSaveFileName registers fcwebRegisterSave before writing.
// FreeCAD 1.1.3 src/Gui/CommandDoc.cpp: Std_Export reads FileExportFilter;
// src/Mod/Mesh/Init.py registers the exact STL filter used below.
export async function testNativeMenus({ page, python, record, exportRequests, reportDirectory }) {
  const documentName = `EnsaioMenuNativo_${randomUUID().slice(0, 8)}`;
  const report = { documentName, actions: [] };
  const requestsBefore = exportRequests.length;
  let configured = false;
  const downloadCount = () => page.evaluate(() => window.__freecadTestDownloads.length);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const waitForDownload = async (after, extension) => {
    await page.waitForFunction(({ after, extension }) => window.__freecadTestDownloads
      .slice(after).some(item => item.name.toLowerCase().endsWith(extension)),
    { timeout: 90000 }, { after, extension });
    return page.evaluate(async ({ after, extension }) => {
      const item = window.__freecadTestDownloads.slice(after)
        .find(item => item.name.toLowerCase().endsWith(extension));
      return { name: item.name, bytes: [...new Uint8Array(await item.blob.arrayBuffer())], receipt: item.receipt };
    }, { after, extension });
  };
  const trigger = async command => {
    // QAction enabled state follows Qt's normal command-update timer. Do not
    // force-enable the action or replace the command to bypass that contract.
    for (let attempt = 0; attempt < 40; attempt++) {
      const state = await python(`proof = _cfg_native_menu_action(${JSON.stringify(command)})`);
      if (state.triggered) { report.actions.push(state); return state; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Native menu action stayed disabled: ${command}`);
  };
  await page.evaluate(() => {
    if (typeof window.fcwebRegisterSave !== 'function') throw new Error('native save bridge is absent');
    window.__freecadNativeOriginalRegister = window.fcwebRegisterSave;
    window.__freecadNativeRegistrations = [];
    window.fcwebRegisterSave = function (path) {
      window.__freecadNativeRegistrations.push(path);
      return window.__freecadNativeOriginalRegister.call(this, path);
    };
  });
  try {
    const prepared = await python(`import FreeCAD as App, FreeCADGui as Gui, sys
from PySide6 import QtWidgets
_cfg_menu_params = App.ParamGet('User parameter:BaseApp/Preferences/General')
_cfg_menu_previous = {'active': App.ActiveDocument.Name if App.ActiveDocument else None,
 'selection': [(o.Document.Name, o.Name) for o in Gui.Selection.getSelection()],
 'filter': _cfg_menu_params.GetString('FileExportFilter'),
 'filename': _cfg_menu_params.GetString('ExportDefaultFilenameSingle', '%F-%P-')}
_cfg_menu_document = App.newDocument(${JSON.stringify(documentName)})
_cfg_menu_box = _cfg_menu_document.addObject('Part::Box', 'PecaMenu')
_cfg_menu_box.Length = 7
_cfg_menu_box.Width = 11
_cfg_menu_box.Height = 13
_cfg_menu_document.recompute()
Gui.activeDocument().activeView().viewIsometric()
Gui.activeDocument().activeView().fitAll()
Gui.Selection.clearSelection()
Gui.Selection.addSelection(_cfg_menu_box)
Gui.updateGui()
def _cfg_native_menu_action(command):
 Gui.updateGui()
 actions = Gui.Command.get(command).getAction()
 if not actions: raise RuntimeError('No native QAction for ' + command)
 action = actions[0]
 menus = [menu.title() for menu in Gui.getMainWindow().findChildren(QtWidgets.QMenu) if action in menu.actions()]
 if not menus: raise RuntimeError('QAction is not reachable from a native menu: ' + command)
 result = {'command': command, 'text': action.text(), 'menus': menus, 'triggered': False}
 if action.isEnabled():
  action.trigger()
  result['triggered'] = True
 return result
proof = {'name': _cfg_menu_document.Name, 'volume': _cfg_menu_box.Shape.Volume}`);
    configured = true;
    assert.equal(prepared.name, documentName);
    assert.ok(Math.abs(prepared.volume - 1001) < 1e-6);

    let before = await downloadCount();
    await trigger('Std_SaveAs');
    const first = await waitForDownload(before, '.fcstd');
    const firstBytes = Buffer.from(first.bytes);
    assert.deepEqual([...firstBytes.subarray(0, 4)], [80, 75, 3, 4]);
    const saved = await python(`proof = {'filename': _cfg_menu_document.FileName}`);
    const registrations = await page.evaluate(() => [...window.__freecadNativeRegistrations]);
    assert.ok(registrations.includes(saved.filename), 'Save As must traverse the native file-dialog bridge');
    assert.match(saved.filename, /^\/home\/web_user\/_dl\/[^/]+\.fcstd$/i);
    assert.equal(first.name, saved.filename.split('/').pop());
    assert.equal(exportRequests.length, requestsBefore, 'native FCStd Save As must not authorize a paid export');
    await writeFile(join(reportDirectory, 'native-menu-save-as.FCStd'), firstBytes);
    report.saveAs = { name: first.name, bytes: firstBytes.length, sha256: digest(firstBytes), callback: saved.filename };
    record('native File > Save As QAction reaches its file-dialog callback and downloads a real free FCStd');

    before = await downloadCount();
    await python(`_cfg_menu_box.Height = 14
_cfg_menu_document.recompute()
Gui.updateGui()
proof = {'volume': _cfg_menu_box.Shape.Volume}`);
    await trigger('Std_Save');
    const updated = await waitForDownload(before, '.fcstd');
    const updatedBytes = Buffer.from(updated.bytes);
    assert.equal(updated.name, first.name);
    assert.deepEqual([...updatedBytes.subarray(0, 4)], [80, 75, 3, 4]);
    assert.notEqual(digest(updatedBytes), digest(firstBytes), 'native Save must deliver the edited document');
    assert.equal(exportRequests.length, requestsBefore, 'native FCStd Save must remain free');
    // Reopen the downloaded bytes using the product's file picker. Reading the
    // already-open source path could return the same native document instead.
    const editedPath = join(reportDirectory, 'native-menu-edited.FCStd');
    await writeFile(editedPath, updatedBytes);
    const chooser = page.waitForFileChooser();
    await page.click('#open');
    await (await chooser).accept([editedPath]);
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Modelo aberto.'), { timeout: 60000 });
    const reopened = await python(`_cfg_check = App.ActiveDocument
if _cfg_check.Name == _cfg_menu_document.Name: raise RuntimeError('Downloaded FCStd was not reopened separately')
try:
 _cfg_check_box = _cfg_check.getObject('PecaMenu')
 proof = {'height': _cfg_check_box.Height.Value, 'volume': _cfg_check_box.Shape.Volume, 'valid': _cfg_check_box.Shape.isValid()}
finally:
 App.closeDocument(_cfg_check.Name)
 App.setActiveDocument(_cfg_menu_document.Name)
 Gui.activeDocument().activeView().viewIsometric()
 Gui.Selection.clearSelection()
 Gui.Selection.addSelection(_cfg_menu_box)
 Gui.updateGui()`);
    assert.equal(reopened.height, 14);
    assert.ok(Math.abs(reopened.volume - 1078) < 1e-6);
    assert.equal(reopened.valid, true);
    report.savedEdit = { name: updated.name, bytes: updatedBytes.length, sha256: digest(updatedBytes), ...reopened };
    record('native File > Save downloads changed bytes and the saved FCStd reopens with its edited dimensions');

    before = await downloadCount();
    await python(`_cfg_menu_params.SetString('FileExportFilter', 'STL Mesh (*.stl *.ast)')
_cfg_menu_params.SetString('ExportDefaultFilenameSingle', 'native-menu-export')
Gui.Selection.clearSelection()
Gui.Selection.addSelection(_cfg_menu_box)
Gui.updateGui()
proof = {'modules': App.getExportType('stl')}`);
    await page.evaluate(() => { window.__freecadTestReceipt = null; });
    await trigger('Std_Export');
    const exported = await waitForDownload(before, '.stl');
    const stl = Buffer.from(exported.bytes);
    assert.equal(exportRequests.length, requestsBefore + 1, 'native STL must use the existing export authorization');
    assert.equal(exported.receipt?.schema, 'confenge.tools.emission/v1');
    assert.equal(exported.receipt.toolId, 'modelador-parametrico-3d');
    assert.equal(exported.receipt.format, 'stl');
    assert.equal(exported.receipt.bytes, stl.length);
    assert.equal(exported.receipt.sha256, digest(stl));
    const exportPaths = await page.evaluate(() => [...window.__freecadNativeRegistrations]);
    assert.ok(exportPaths.some(path => path.endsWith('/' + exported.name)), 'native Export must traverse the file-dialog bridge');
    const vertices = [];
    if (/^solid\s/i.test(stl.toString('utf8', 0, 100))) {
      const text = stl.toString('utf8');
      assert.match(text, /facet normal[\s\S]*endsolid/);
      for (const vertex of text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) vertices.push(vertex.slice(1).map(Number));
    } else {
      assert.ok(stl.length >= 84);
      const triangles = stl.readUInt32LE(80);
      assert.ok(triangles >= 12);
      assert.equal(stl.length, 84 + triangles * 50);
      for (let triangle = 0; triangle < triangles; triangle++) for (let vertex = 0; vertex < 3; vertex++) {
        const offset = 84 + triangle * 50 + 12 + vertex * 12;
        vertices.push([0, 4, 8].map(axis => stl.readFloatLE(offset + axis)));
      }
    }
    assert.ok(vertices.length >= 36);
    const bounds = [0, 1, 2].map(axis => Math.max(...vertices.map(vertex => vertex[axis])) - Math.min(...vertices.map(vertex => vertex[axis])));
    bounds.forEach((value, axis) => assert.ok(Math.abs(value - [7, 11, 14][axis]) < 1e-6, 'native export must contain the edited selected solid'));
    await writeFile(join(reportDirectory, 'native-menu-export.stl'), stl);
    await page.screenshot({ path: join(reportDirectory, 'native-menus.png'), fullPage: true });
    report.export = { name: exported.name, bytes: stl.length, sha256: digest(stl), bounds, registrations: exportPaths };
    record('native File > Export QAction produces STL through the native bridge and receipt-bound delivery');
    return report;
  } finally {
    if (configured) await python(`App.closeDocument(_cfg_menu_document.Name)
_cfg_menu_params.SetString('FileExportFilter', _cfg_menu_previous['filter'])
_cfg_menu_params.SetString('ExportDefaultFilenameSingle', _cfg_menu_previous['filename'])
if _cfg_menu_previous['active'] in App.listDocuments():
 App.setActiveDocument(_cfg_menu_previous['active'])
 Gui.Selection.clearSelection()
 for _cfg_doc, _cfg_object in _cfg_menu_previous['selection']:
  if _cfg_doc in App.listDocuments() and App.getDocument(_cfg_doc).getObject(_cfg_object):
   Gui.Selection.addSelection(_cfg_doc, _cfg_object)
 Gui.updateGui()
proof = {'restored': True}`).catch(() => {});
    await page.evaluate(() => {
      if (window.__freecadNativeOriginalRegister) window.fcwebRegisterSave = window.__freecadNativeOriginalRegister;
      delete window.__freecadNativeOriginalRegister;
    }).catch(() => {});
  }
}
