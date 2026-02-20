use chromiumoxide::page::Page;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Command {
    Navigate { url: String },
    Click { selector: String },
    Type { selector: String, text: String },
    Scroll { selector: String },
    Wait { selector: String, #[serde(default = "default_timeout")] timeout: u64 },
    WaitIdle { #[serde(default = "default_timeout")] timeout: u64 },
    Eval { js: String },
    Extract { mode: String },
    Snap,
    Screenshot { #[serde(alias = "file")] path: String },
    Assert { expr: String },
}

fn default_timeout() -> u64 { 15000 }

#[derive(Debug, Clone, Serialize)]
pub struct StepResult {
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Execute a sequence of commands on a page.
pub async fn execute(
    page: &Page,
    commands: Vec<Command>,
    timeout_ms: u64,
) -> Result<Vec<StepResult>, Box<dyn std::error::Error>> {
    let mut results = Vec::new();

    for cmd in commands {
        let result = execute_one(page, &cmd, timeout_ms).await;
        let ok = result.ok;
        results.push(result);
        if !ok {
            break; // Stop on first failure
        }
    }

    Ok(results)
}

async fn execute_one(page: &Page, cmd: &Command, _timeout_ms: u64) -> StepResult {
    match cmd {
        Command::Navigate { url } => {
            match page.goto(url).await {
                Ok(_) => {
                    // Wait for page load
                    let _ = page.wait_for_navigation().await;
                    StepResult { command: "navigate".into(), value: None, ok: true, error: None }
                }
                Err(e) => StepResult { command: "navigate".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Click { selector } => {
            match page.find_element(selector).await {
                Ok(el) => match el.click().await {
                    Ok(_) => StepResult { command: "click".into(), value: None, ok: true, error: None },
                    Err(e) => StepResult { command: "click".into(), value: None, ok: false, error: Some(e.to_string()) },
                },
                Err(e) => StepResult { command: "click".into(), value: None, ok: false, error: Some(format!("selector not found: {e}")) },
            }
        }

        Command::Type { selector, text } => {
            // Resolve $ENV.KEY references
            let resolved = resolve_env(text);
            match page.find_element(selector).await {
                Ok(el) => match el.click().await.and(el.type_str(&resolved).await) {
                    Ok(_) => StepResult { command: "type".into(), value: None, ok: true, error: None },
                    Err(e) => StepResult { command: "type".into(), value: None, ok: false, error: Some(e.to_string()) },
                },
                Err(e) => StepResult { command: "type".into(), value: None, ok: false, error: Some(format!("selector not found: {e}")) },
            }
        }

        Command::Scroll { selector } => {
            let js = format!(
                "document.querySelector({}).scrollIntoView({{behavior:'smooth',block:'center'}})",
                serde_json::to_string(selector).unwrap()
            );
            match page.evaluate(js).await {
                Ok(_) => StepResult { command: "scroll".into(), value: None, ok: true, error: None },
                Err(e) => StepResult { command: "scroll".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Wait { selector, timeout } => {
            let timeout_dur = Duration::from_millis(*timeout);
            let start = std::time::Instant::now();
            loop {
                if start.elapsed() > timeout_dur {
                    return StepResult { command: "wait".into(), value: None, ok: false, error: Some(format!("timeout waiting for {selector}")) };
                }
                match page.find_element(selector).await {
                    Ok(_) => return StepResult { command: "wait".into(), value: None, ok: true, error: None },
                    Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
                }
            }
        }

        Command::WaitIdle { timeout } => {
            // Wait for network idle by polling pending requests
            let timeout_dur = Duration::from_millis(*timeout);
            let js = r#"new Promise(r => {
                let t; const check = () => { clearTimeout(t); t = setTimeout(r, 500); };
                if (document.readyState === 'complete') check();
                else window.addEventListener('load', check);
            })"#;
            match tokio::time::timeout(timeout_dur, page.evaluate(js)).await {
                Ok(Ok(_)) => StepResult { command: "waitIdle".into(), value: None, ok: true, error: None },
                Ok(Err(e)) => StepResult { command: "waitIdle".into(), value: None, ok: false, error: Some(e.to_string()) },
                Err(_) => StepResult { command: "waitIdle".into(), value: None, ok: false, error: Some("timeout waiting for idle".into()) },
            }
        }

        Command::Eval { js } => {
            match page.evaluate(js.as_str()).await {
                Ok(val) => {
                    let v = val.into_value::<serde_json::Value>().ok();
                    StepResult { command: "eval".into(), value: v, ok: true, error: None }
                }
                Err(e) => StepResult { command: "eval".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Extract { mode } => {
            let js = match mode.as_str() {
                "text" => "document.body?.innerText || ''".to_string(),
                "links" => "JSON.stringify([...document.querySelectorAll('a[href]')].map(a=>({text:a.textContent.trim(),href:a.href})))".to_string(),
                "tables" => r#"JSON.stringify([...document.querySelectorAll('table')].map(t=>{
                    const headers=[...t.querySelectorAll('th')].map(h=>h.textContent.trim());
                    const rows=[...t.querySelectorAll('tbody tr')].map(r=>[...r.querySelectorAll('td')].map(d=>d.textContent.trim()));
                    return {headers,rows};
                }))"#.to_string(),
                "inputs" => "JSON.stringify([...document.querySelectorAll('input,textarea,select')].map(i=>({tag:i.tagName.toLowerCase(),type:i.type||'',name:i.name||'',id:i.id||'',value:i.value||''})))".to_string(),
                "novoid" => "JSON.stringify(typeof __novoid_observed!=='undefined'?__novoid_observed.getAll():null)".to_string(),
                _ => return StepResult { command: "extract".into(), value: None, ok: false, error: Some(format!("unknown extract mode: {mode}")) },
            };
            match page.evaluate(js).await {
                Ok(val) => {
                    let raw = val.into_value::<serde_json::Value>().ok();
                    // If the result is a JSON string, parse it
                    let parsed = raw.and_then(|v| {
                        if let serde_json::Value::String(s) = &v {
                            serde_json::from_str(s).ok().or(Some(v))
                        } else {
                            Some(v)
                        }
                    });
                    StepResult { command: "extract".into(), value: parsed, ok: true, error: None }
                }
                Err(e) => StepResult { command: "extract".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Snap => {
            let js = r#"JSON.stringify({
                title: document.title || '',
                text: (document.body?.innerText || '').slice(0, 2000),
                links: [...document.querySelectorAll('a[href]')].map(a=>({text:a.textContent.trim(),href:a.href})),
                inputs: [...document.querySelectorAll('input,textarea,select')].map(i=>({tag:i.tagName.toLowerCase(),type:i.type||'',name:i.name||'',id:i.id||''})),
                tables: document.querySelectorAll('table').length
            })"#;
            match page.evaluate(js).await {
                Ok(val) => {
                    let raw = val.into_value::<serde_json::Value>().ok();
                    let parsed = raw.and_then(|v| {
                        if let serde_json::Value::String(s) = &v {
                            serde_json::from_str(s).ok().or(Some(v))
                        } else {
                            Some(v)
                        }
                    });
                    StepResult { command: "snap".into(), value: parsed, ok: true, error: None }
                }
                Err(e) => StepResult { command: "snap".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Screenshot { path } => {
            match page.screenshot(chromiumoxide::page::ScreenshotParams::builder().full_page(true).build()).await {
                Ok(bytes) => {
                    match std::fs::write(path, &bytes) {
                        Ok(_) => StepResult {
                            command: "screenshot".into(),
                            value: Some(serde_json::json!({ "path": path, "bytes": bytes.len() })),
                            ok: true,
                            error: None,
                        },
                        Err(e) => StepResult { command: "screenshot".into(), value: None, ok: false, error: Some(e.to_string()) },
                    }
                }
                Err(e) => StepResult { command: "screenshot".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }

        Command::Assert { expr } => {
            let js = format!("Boolean({})", expr);
            match page.evaluate(js).await {
                Ok(val) => {
                    let passed = val.into_value::<bool>().unwrap_or(false);
                    if passed {
                        StepResult { command: "assert".into(), value: Some(serde_json::json!(true)), ok: true, error: None }
                    } else {
                        StepResult { command: "assert".into(), value: Some(serde_json::json!(false)), ok: false, error: Some(format!("assertion failed: {expr}")) }
                    }
                }
                Err(e) => StepResult { command: "assert".into(), value: None, ok: false, error: Some(e.to_string()) },
            }
        }
    }
}

/// Load a JSON command script from file.
pub fn load_script(path: &str) -> Result<(String, Vec<Command>), Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let script: ScriptFile = serde_json::from_str(&content)?;
    let mut commands = Vec::new();
    commands.push(Command::Navigate { url: resolve_env(&script.url) });
    for step in script.steps {
        commands.push(resolve_script_env(step));
    }
    Ok((script.url, commands))
}

#[derive(Deserialize)]
struct ScriptFile {
    url: String,
    steps: Vec<Command>,
}

/// Resolve $ENV.KEY references in a string from .env.local or environment.
fn resolve_env(s: &str) -> String {
    let mut result = s.to_string();
    while let Some(start) = result.find("$ENV.") {
        let rest = &result[start + 5..];
        let end = rest.find(|c: char| !c.is_alphanumeric() && c != '_').unwrap_or(rest.len());
        let key = &rest[..end];
        let val = std::env::var(key).unwrap_or_default();
        result = format!("{}{}{}", &result[..start], val, &rest[end..]);
    }
    result
}

/// Resolve env vars in command text fields.
fn resolve_script_env(cmd: Command) -> Command {
    match cmd {
        Command::Type { selector, text } => Command::Type { selector, text: resolve_env(&text) },
        Command::Navigate { url } => Command::Navigate { url: resolve_env(&url) },
        other => other,
    }
}
