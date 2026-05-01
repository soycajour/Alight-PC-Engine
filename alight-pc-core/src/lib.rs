mod renderer;
mod parser;

use napi_derive::napi;
use std::sync::Arc;
use renderer::Renderer;
use parser::parse_alight_xml;

#[napi]
pub struct AlightCore {
    // Future: Add WGPU instance, device, and queue here
}

#[napi]
impl AlightCore {
    #[napi(constructor)]
    pub fn new() -> Self {
        env_logger::init();
        log::info!("Alight PC Native Core initialized");
        AlightCore {}
    }

    #[napi]
    pub fn render_frame(&self, time_ms: f64) -> String {
        // Future: Return a buffer or a handle to the GPU texture
        format!("Rendering frame at {}ms", time_ms)
    }

    #[napi]
    pub fn parse_xml(&self, xml_content: String) -> bool {
        log::info!("Parsing XML composed of {} bytes", xml_content.len());
        match parse_alight_xml(&xml_content) {
            Ok(scene) => {
                log::info!("Successfully parsed scene with {} layers", scene.layers.len());
                true
            },
            Err(e) => {
                log::error!("Failed to parse XML: {}", e);
                false
            }
        }
    }
}
