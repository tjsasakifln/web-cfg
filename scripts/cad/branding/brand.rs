// CONFENGE edition: render the official mark in the same egui canvas as the Start page.
use egui::{Color32, Context, Rect, TextureHandle, TextureOptions, Ui, pos2, vec2};

pub fn logo(ui: &Ui, rect: Rect, background: Color32) {
    let dark = background.r() < 128;
    let key = egui::Id::unique(("confenge_wordmark", dark));
    let cached = ui.ctx().data_mut(|data| data.get_temp::<TextureHandle>(key));
    let texture = cached.unwrap_or_else(|| {
        let texture = load_logo(ui.ctx(), dark);
        ui.ctx().data_mut(|data| data.insert_temp(key, texture.clone()));
        texture
    });
    let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
    ui.painter().image(texture.id(), rect, uv, Color32::WHITE);
}

fn load_logo(ctx: &Context, dark: bool) -> TextureHandle {
    let (name, bytes): (&str, &[u8]) = if dark {
        ("CONFENGE dark", include_bytes!("confenge-dark.png"))
    } else {
        ("CONFENGE light", include_bytes!("confenge-light.png"))
    };
    let rgba = image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .expect("checked CONFENGE logo").into_rgba8();
    let size = [rgba.width() as usize, rgba.height() as usize];
    ctx.load_texture(name, egui::ColorImage::from_rgba_unmultiplied(size, rgba.as_raw()), TextureOptions::LINEAR)
}

pub fn start_logo(ui: &Ui, sidebar: Rect, background: Color32) {
    // Keep the transparent padding in the asset and preserve its native 500:130 ratio.
    let rect = Rect::from_min_size(sidebar.min + vec2(28.0, 30.0), vec2(200.0, 52.0));
    logo(ui, rect, background);
}

// Keep the DWG device IDs intact. Only the built-in devices receive display names.
pub fn device_name(name: &str) -> &str {
    match name {
        "CADCraft PDF" => "CONFENGE PDF",
        "CADCraft PNG" => "CONFENGE PNG",
        "CADCraft SVG" => "CONFENGE SVG",
        other => other,
    }
}
