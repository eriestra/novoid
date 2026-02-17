use crate::synthesizer::BrowseSchema;
use serde_json::Value;

/// Output the browse schema as pretty-printed JSON to stdout
pub fn output_json(schema: &BrowseSchema) {
    match serde_json::to_string_pretty(schema) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            eprintln!("Error serializing output: {e}");
            std::process::exit(1);
        }
    }
}

/// Output the browse schema as compact JSON (for piping)
pub fn output_json_compact(schema: &BrowseSchema) {
    match serde_json::to_string(schema) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            eprintln!("Error serializing output: {e}");
            std::process::exit(1);
        }
    }
}

/// Output a human-readable peek view
pub fn output_peek(schema: &BrowseSchema) {
    let w = 60;
    let title = schema
        .url
        .rsplit('/')
        .next()
        .unwrap_or(&schema.url);

    // Header
    println!("\x1b[36m┌─ novoid-browser ─{:─<width$}┐\x1b[0m", "", width = w - 19);
    println!("\x1b[36m│\x1b[0m \x1b[1m{:<width$}\x1b[0m\x1b[36m│\x1b[0m", title, width = w - 1);
    println!("\x1b[36m│\x1b[0m \x1b[2m{:<width$}\x1b[0m\x1b[36m│\x1b[0m", truncate(&schema.url, w - 2), width = w - 1);

    // State
    if let Value::Object(state) = &schema.state {
        if !state.is_empty() {
            section_header("State", w);
            for (key, val) in state {
                let display = format_value_short(val, w - key.len() - 5);
                println!(
                    "\x1b[36m│\x1b[0m  \x1b[33m{}\x1b[0m: {:<width$}\x1b[36m│\x1b[0m",
                    key,
                    display,
                    width = w - key.len() - 5
                );
            }
        }
    }

    // Actions
    if !schema.actions.is_empty() {
        section_header("Actions", w);
        for action in &schema.actions {
            let line = format!("\x1b[32m▶\x1b[0m {}  \x1b[2m{}\x1b[0m", action.name, action.source);
            let visible_len = action.name.len() + action.source.len() + 5;
            let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
            println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
        }
    }

    // Entities
    if let Value::Object(entities) = &schema.entities {
        if !entities.is_empty() {
            section_header("Entities", w);
            for (key, val) in entities {
                let count = val.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
                let schema_str = if let Some(Value::Object(s)) = val.get("schema") {
                    let fields: Vec<String> = s
                        .iter()
                        .map(|(k, v)| format!("{}: {}", k, v.as_str().unwrap_or("?")))
                        .collect();
                    format!("{{{}}}", fields.join(", "))
                } else {
                    "{}".to_string()
                };
                let line = format!("{} ({}) \x1b[2m{}\x1b[0m", key, count, truncate(&schema_str, 30));
                let visible_len = key.len() + format!(" ({}) ", count).len() + schema_str.len().min(30);
                let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
                println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
            }
        }
    }

    // Components
    if !schema.components.is_empty() {
        section_header("Components", w);
        let comp_line = schema.components.join(", ");
        println!(
            "\x1b[36m│\x1b[0m  {:<width$}\x1b[36m│\x1b[0m",
            truncate(&comp_line, w - 3),
            width = w - 2
        );
    }

    // Navigation
    if !schema.navigation.is_empty() {
        section_header("Routes", w);
        for route in &schema.navigation {
            let guard = if route.has_guard { " \x1b[33m🔒\x1b[0m" } else { "" };
            let line = format!("{}{}", route.path, guard);
            let visible_len = route.path.len() + if route.has_guard { 3 } else { 0 };
            let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
            println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
        }
    }

    // Forms
    if !schema.forms.is_empty() {
        section_header("Forms", w);
        for form in &schema.forms {
            let fields = form.fields.join(", ");
            println!(
                "\x1b[36m│\x1b[0m  form_{}: {:<width$}\x1b[36m│\x1b[0m",
                form.id,
                truncate(&fields, w - 12),
                width = w - 11
            );
        }
    }

    // Convex
    if let Some(ref cvx) = schema.convex {
        let has_content = !cvx.subscriptions.is_empty() || !cvx.mutations.is_empty() || !cvx.actions.is_empty();
        if has_content {
            section_header("Convex", w);
            for sub in &cvx.subscriptions {
                let line = format!("\x1b[36m⟳\x1b[0m {}", sub.query_ref);
                let visible_len = sub.query_ref.len() + 3;
                let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
                println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
            }
            for m in &cvx.mutations {
                let line = format!("\x1b[33m▸\x1b[0m {}", m.call_ref);
                let visible_len = m.call_ref.len() + 3;
                let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
                println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
            }
            for a in &cvx.actions {
                let line = format!("\x1b[35m▸\x1b[0m {}", a.call_ref);
                let visible_len = a.call_ref.len() + 3;
                let pad = if visible_len < w - 2 { w - 2 - visible_len } else { 0 };
                println!("\x1b[36m│\x1b[0m {}{:<pad$}\x1b[36m│\x1b[0m", line, "", pad = pad);
            }
        }
    }

    // Errors
    if !schema.errors.is_empty() {
        section_header("Errors", w);
        for err in &schema.errors {
            println!(
                "\x1b[36m│\x1b[0m  \x1b[31m{:<width$}\x1b[0m\x1b[36m│\x1b[0m",
                truncate(&err.message, w - 3),
                width = w - 3
            );
        }
    }

    // Console (only if non-empty)
    let interesting: Vec<_> = schema
        .console
        .iter()
        .filter(|c| c.level == "error" || c.level == "warn")
        .collect();
    if !interesting.is_empty() {
        section_header("Console", w);
        for entry in interesting.iter().take(5) {
            let icon = match entry.level.as_str() {
                "error" => "\x1b[31m✗\x1b[0m",
                "warn" => "\x1b[33m!\x1b[0m",
                _ => " ",
            };
            let msg = entry.args.join(" ");
            println!(
                "\x1b[36m│\x1b[0m {} {:<width$}\x1b[36m│\x1b[0m",
                icon,
                truncate(&msg, w - 4),
                width = w - 4
            );
        }
    }

    // Footer
    println!("\x1b[36m└{:─<width$}┘\x1b[0m", "", width = w);
}

fn section_header(name: &str, w: usize) {
    let dashes = w - name.len() - 3;
    println!(
        "\x1b[36m├─ {} {:─<width$}┤\x1b[0m",
        name,
        "",
        width = dashes
    );
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else if max > 3 {
        format!("{}...", &s[..max - 3])
    } else {
        s[..max].to_string()
    }
}

fn format_value_short(val: &Value, max_len: usize) -> String {
    match val {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => {
            let quoted = format!("\"{}\"", s);
            truncate(&quoted, max_len)
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                "[]".to_string()
            } else {
                let preview = format!("[...] ({} items)", arr.len());
                truncate(&preview, max_len)
            }
        }
        Value::Object(obj) => {
            if obj.is_empty() {
                "{}".to_string()
            } else {
                let keys: Vec<&String> = obj.keys().take(3).collect();
                let preview = format!("{{{}, ...}}", keys.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", "));
                truncate(&preview, max_len)
            }
        }
    }
}
