"""Build-time source adaptation for the pinned CONFENGE CAD browser edition."""
from pathlib import Path
import shutil
import sys

src = Path(sys.argv[1]).resolve()
assets = Path(sys.argv[2]).resolve()
ui = src / "crates/ui-egui/src"
web = src / "apps/cadcraft-web/src"

def edit(path, edits):
    old = path.read_text()
    new = old
    for before, after in edits:
        if before not in new:
            raise ValueError(f"Unexpected pinned source in {path.name}: {before[:50]}")
        new = new.replace(before, after)
    path.write_text(new)

edit(ui / "chrome.rs", [
    ('p.text(pos2(left.left() + 34.0, left.top() + 70.0), egui::Align2::LEFT_CENTER, crate::tl!("CADCraft"), egui::FontId::proportional(28.0), t.text);',
     'crate::branding::start_logo(ui, left, t.chrome_dark);'),
    ('format!("CADCraft      ', 'format!("CONFENGE      '),
])
edit(ui / "dialogs.rs", [
    ('ui.heading(crate::tl!("CADCraft"));',
     'let (mark, _) = ui.allocate_exact_size(vec2(200.0, 52.0), egui::Sense::hover());\n                    crate::branding::logo(ui, mark, t.chrome);'),
    ('ui.label(RichText::new(crate::tl!("One of the Crafting Apps by the ArtCraft team and community.")).color(t.text_dim));',
     'ui.hyperlink_to("confenge.com.br/cad", "https://confenge.com.br/cad/");'),
    ('ui.hyperlink_to("getartcraft.com/apps/cadcraft", "https://getartcraft.com/apps/cadcraft");',
     'ui.hyperlink_to(crate::tl!("Licenses"), "/cad/editor/licencas/fontes-e-codigo.txt");'),
    ('                    ui.hyperlink_to(crate::tl!("Join us on Discord"), "https://discord.gg/artcraft");\n', ''),
    ('"About CADCraft"', '"About CONFENGE CAD"'),
])
edit(ui / "lib.rs", [('pub mod chrome;', 'mod branding;\npub mod chrome;')])
for path in [web/"host.rs", ui/"autosave.rs", ui/"closing.rs", ui/"fault.rs", ui/"lib.rs", ui/"menus.rs",
             ui/"options/dialog.rs", ui/"updates_ui.rs", ui/"viewcube.rs"]:
    edit(path, [("CADCraft", "CONFENGE CAD")])
edit(ui / "managers.rs", [
    (".selected_text(device_label(page))", ".selected_text(crate::branding::device_name(device_label(page)))"),
    ("ui.selectable_label(on, &dev.name)", "ui.selectable_label(on, crate::branding::device_name(&dev.name))"),
])
edit(web / "main.rs", [("CADCraft", "CONFENGE")])
for catalog in (ui/"i18n").glob("*.tsv"):
    lines = catalog.read_text().splitlines(keepends=True)
    text = ''.join(line if line.startswith('#') else line.replace('CADCraft', 'CONFENGE CAD') for line in lines)
    if catalog.name == 'pt_br.tsv' and '\tLicenses\t' not in text:
        text += '\tLicenses\tCréditos e licenças\n'
    catalog.write_text(text)
shutil.copyfile(Path(__file__).with_name("brand.rs"), ui/"branding.rs")
for filename, dest in [
    ("logo-confenge-500-f8a83f6d.png","confenge-light.png"),
    ("logo-confenge-white-500-1677038e.png","confenge-dark.png"),
]:
    shutil.copyfile(assets/filename, ui/dest)
