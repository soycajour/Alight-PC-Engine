use roxmltree::{Document, Node};
use glam::{Vec2, Mat3};

pub struct Scene {
    pub width: u32,
    pub height: u32,
    pub total_time: f64,
    pub fps: f32,
    pub layers: Vec<Layer>,
}

pub struct Layer {
    pub id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub transform: Transform,
    pub shape_type: String,
}

pub struct Transform {
    pub location: Vec2,
    pub scale: Vec2,
    pub rotation: f32,
    pub pivot: Vec2,
}

pub fn parse_alight_xml(xml: &str) -> Result<Scene, Box<dyn std::error::Error>> {
    let doc = Document::parse(xml)?;
    let root = doc.root_element();
    
    let width = root.attribute("width").unwrap_or("1920").parse()?;
    let height = root.attribute("height").unwrap_or("1080").parse()?;
    let total_time = root.attribute("totalTime").unwrap_or("0").parse()?;
    let fps = root.attribute("fps").unwrap_or("30.0").parse()?;

    let mut layers = Vec::new();
    
    for node in root.children() {
        if node.is_element() && (node.has_tag_name("shape") || node.has_tag_name("embedScene")) {
            layers.push(parse_layer(node));
        }
    }

    Ok(Scene { width, height, total_time, fps, layers })
}

fn parse_layer(node: Node) -> Layer {
    let id = node.attribute("id").unwrap_or("").to_string();
    let start_time = node.attribute("startTime").unwrap_or("0").parse().unwrap_or(0.0);
    let end_time = node.attribute("endTime").unwrap_or("0").parse().unwrap_or(0.0);
    let shape_type = node.attribute("s").unwrap_or("").to_string();

    // Placeholder for transform parsing logic
    let transform = Transform {
        location: Vec2::ZERO,
        scale: Vec2::ONE,
        rotation: 0.0,
        pivot: Vec2::ZERO,
    };

    Layer { id, start_time, end_time, transform, shape_type }
}
