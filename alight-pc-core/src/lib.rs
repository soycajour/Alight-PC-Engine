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

#[cfg(test)]
mod tests {
    use super::*;
    use wgpu::*;

    #[tokio::test]
    async fn test_gpu_communication() {
        println!("--- ALIGHT NATIVE CORE: GPU VALIDATION ---");
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        println!("Listing available GPU adapters:");
        let mut found_any = false;
        for (i, adapter) in instance.enumerate_adapters(wgpu::Backends::all()).enumerate() {
            found_any = true;
            let info = adapter.get_info();
            println!("Adapter {}: {} ({:?})", i, info.name, info.device_type);
        }

        assert!(found_any, "No GPU adapters found! WGPU cannot see your hardware.");

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .expect("Failed to find a suitable GPU adapter");

        let info = adapter.get_info();
        println!("\n>>> SELECTED ADAPTER: {} ({:?})", info.name, info.backend);

        let (device, _queue) = adapter
            .request_device(
                &DeviceDescriptor {
                    features: Features::empty(),
                    limits: Limits::default(),
                    label: Some("AlightCore Validation Device"),
                },
                None,
            )
            .await
            .expect("Failed to create WGPU device. Driver might be outdated or incompatible.");

        println!(">>> WGPU DEVICE CREATED SUCCESSFULLY. ID: {:?}", device);
        println!("--- VALIDATION COMPLETE ---\n");
    }
}
