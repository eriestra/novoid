// Extractor logic is embedded in executor.rs via JS eval expressions.
// This module provides higher-level extraction helpers if needed.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub url: String,
    pub title: String,
    pub text: String,
    pub links: Vec<Link>,
    pub inputs: Vec<Input>,
    pub tables: usize,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct Link {
    pub text: String,
    pub href: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct Input {
    pub tag: String,
    #[serde(rename = "type")]
    pub input_type: String,
    pub name: String,
    pub id: String,
}

/// Parse a snap StepResult value into a Snapshot struct.
pub fn parse_snapshot(url: &str, value: &Value) -> Option<Snapshot> {
    let obj = value.as_object()?;
    Some(Snapshot {
        url: url.to_string(),
        title: obj.get("title")?.as_str().unwrap_or("").to_string(),
        text: obj.get("text")?.as_str().unwrap_or("").to_string(),
        links: obj.get("links")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default(),
        inputs: obj.get("inputs")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default(),
        tables: obj.get("tables").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
    })
}
