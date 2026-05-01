mod renderer;
mod parser;

use napi_derive::napi;
use parser::{parse_alight_xml, Scene};

#[napi]
pub struct AlightCore {
    // Core state will go here
}

#[napi]
impl AlightCore {
    #[napi(constructor)]
    pub fn new() -> Self {
        // Initialize logging once
        let _ = env_logger::builder().is_test(true).try_init();
        log::info!("Alight PC Native Core initialized");
        AlightCore {}
    }

    #[napi]
    pub fn load_project_from_path(&self, path: String) -> Option<Scene> {
        log::info!("Loading project from path: {}", path);
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                match parse_alight_xml(&content) {
                    Ok(scene) => {
                        log::info!("Successfully loaded scene: {}x{} with {} shapes", 
                            scene.width, scene.height, scene.shapes.len());
                        Some(scene)
                    },
                    Err(e) => {
                        log::error!("Failed to parse XML from {}: {}", path, e);
                        None
                    }
                }
            },
            Err(e) => {
                log::error!("Failed to read file {}: {}", path, e);
                None
            }
        }
    }

    #[napi]
    pub fn render_frame(&self, time_ms: f64) -> String {
        format!("Rendering frame at {}ms", time_ms)
    }

    #[napi]
    pub fn get_version(&self) -> String {
        "0.11.0-native-core".to_string()
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
            .expect("Failed to create WGPU device.");

        println!(">>> WGPU DEVICE CREATED SUCCESSFULLY. ID: {:?}", device);
    }
}
