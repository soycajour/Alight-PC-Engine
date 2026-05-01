use roxmltree::{Document, Node};
use napi_derive::napi;
use std::collections::HashMap;
use serde_json::{Value, Number};

#[napi(object)]
pub struct Keyframe {
    pub t: f64,
    pub v: Value,
    pub e: Option<String>,
}

#[napi(object)]
pub struct Property {
    pub name: String,
    pub keyframes: Vec<Keyframe>,
    pub static_value: Option<Value>,
}

#[napi(object)]
pub struct Transform {
    pub location: Option<Property>,
    pub scale: Option<Property>,
    pub rotation: Option<Property>,
    pub pivot: Option<Property>,
    pub opacity: Option<Property>,
}

#[napi(object)]
pub struct Layer {
    pub id: String,
    pub label: String,
    pub layer_type: String,
    pub startTime: f64,
    pub endTime: f64,
    pub transform: Transform,
    pub properties: HashMap<String, String>,
}

#[napi(object)]
pub struct Scene {
    pub width: f64,
    pub height: f64,
    pub totalTime: f64,
    pub fps: f64,
    pub shapes: Vec<Layer>,
    pub nodeLookup: HashMap<String, Layer>,
}

pub fn parse_alight_xml(xml: &str) -> Result<Scene, Box<dyn std::error::Error>> {
    let doc = Document::parse(xml)?;
    let root = doc.root_element();
    
    let width = root.attribute("width").unwrap_or("1920").parse()?;
    let height = root.attribute("height").unwrap_or("1080").parse()?;
    let total_time = root.attribute("totalTime").unwrap_or("0").parse()?;
    let fps = root.attribute("fps").unwrap_or("30.0").parse()?;

    let mut shapes = Vec::new();
    let mut node_lookup = HashMap::new();
    
    for node in root.children() {
        if node.is_element() && (node.has_tag_name("shape") || node.has_tag_name("text") || node.has_tag_name("nullobj")) {
            let layer = parse_layer(node);
            node_lookup.insert(layer.id.clone(), layer_clone(&layer));
            shapes.push(layer);
        }
    }

    Ok(Scene { 
        width, 
        height, 
        totalTime: total_time, 
        fps, 
        shapes,
        nodeLookup: node_lookup,
    })
}

// Helper to clone Layer for lookup (since napi objects aren't easily clonable without manual impl)
fn layer_clone(l: &Layer) -> Layer {
    Layer {
        id: l.id.clone(),
        label: l.label.clone(),
        layer_type: l.layer_type.clone(),
        startTime: l.startTime,
        endTime: l.endTime,
        transform: transform_clone(&l.transform),
        properties: l.properties.clone(),
    }
}

fn transform_clone(t: &Transform) -> Transform {
    Transform {
        location: t.location.as_ref().map(prop_clone),
        scale: t.scale.as_ref().map(prop_clone),
        rotation: t.rotation.as_ref().map(prop_clone),
        pivot: t.pivot.as_ref().map(prop_clone),
        opacity: t.opacity.as_ref().map(prop_clone),
    }
}

fn prop_clone(p: &Property) -> Property {
    Property {
        name: p.name.clone(),
        keyframes: p.keyframes.iter().map(|k| Keyframe { t: k.t, v: k.v.clone(), e: k.e.clone() }).collect(),
        static_value: p.static_value.clone(),
    }
}

fn parse_layer(node: Node) -> Layer {
    let id = node.attribute("id").unwrap_or("").to_string();
    let label = node.attribute("label").unwrap_or("").to_string();
    let start_time = node.attribute("startTime").unwrap_or("0").parse().unwrap_or(0.0);
    let end_time = node.attribute("endTime").unwrap_or("0").parse().unwrap_or(0.0);
    let layer_type = node.tag_name().name().to_string();

    let transform = parse_transform(node);

    Layer { 
        id, 
        label,
        layer_type,
        startTime: start_time, 
        endTime: end_time, 
        transform,
        properties: HashMap::new(),
    }
}

fn parse_transform(node: Node) -> Transform {
    let tx_node = node.children().find(|n| n.has_tag_name("transform"));
    
    if let Some(tn) = tx_node {
        Transform {
            location: parse_prop(tn, "location", "vec3"),
            scale: parse_prop(tn, "scale", "vec2"),
            rotation: parse_prop(tn, "rotation", "float"),
            pivot: parse_prop(tn, "pivot", "vec2"),
            opacity: parse_prop(tn, "opacity", "float"),
        }
    } else {
        Transform {
            location: None, scale: None, rotation: None, pivot: None, opacity: None
        }
    }
}

fn parse_prop(node: Node, name: &str, prop_type: &str) -> Option<Property> {
    let prop_node = node.children().find(|n| n.has_tag_name(name));
    if let Some(pn) = prop_node {
        let value = pn.attribute("value").map(|v| parse_alight_value(v, prop_type));
        let mut keyframes = Vec::new();
        
        for kf in pn.children().filter(|n| n.has_tag_name("kf")) {
            keyframes.push(Keyframe {
                t: kf.attribute("t").unwrap_or("0").parse().unwrap_or(0.0),
                v: parse_alight_value(kf.attribute("v").unwrap_or("0"), prop_type),
                e: kf.attribute("e").map(|e| e.to_string()),
            });
        }
        
        Some(Property {
            name: name.to_string(),
            keyframes,
            static_value: value,
        })
    } else {
        None
    }
}

fn parse_alight_value(v: &str, prop_type: &str) -> Value {
    match prop_type {
        "float" | "int" => {
            if let Ok(f) = v.parse::<f64>() {
                Value::Number(Number::from_f64(f).unwrap())
            } else {
                Value::Number(Number::from(0))
            }
        },
        "vec2" | "vec3" => {
            let parts: Vec<Value> = v.split(',')
                .map(|p| {
                    if let Ok(f) = p.trim().parse::<f64>() {
                        Value::Number(Number::from_f64(f).unwrap())
                    } else {
                        Value::Number(Number::from(0))
                    }
                })
                .collect();
            Value::Array(parts)
        },
        "color" => Value::String(v.to_string()),
        _ => Value::String(v.to_string()),
    }
}
