pub mod parser;
pub mod runtime;
pub mod synthesizer;
pub mod test_runner;
pub mod transport;

use std::path::Path;
use url::Url;

/// Set up body elements in the DOM so querySelector works before scripts run
fn setup_body_elements(
    rt: &runtime::NovoidRuntime,
    parsed: &parser::ParsedPage,
) -> Result<(), String> {
    for el in &parsed.body_elements {
        let mut js = format!("(function() {{ var el = document.createElement('{}');", el.tag);
        if let Some(id) = &el.id {
            js.push_str(&format!(" el.id = '{}'; el._attributes.id = '{}';", id, id));
        }
        if let Some(class) = &el.class {
            js.push_str(&format!(" el.className = '{}';", class));
        }
        js.push_str(" document.body.appendChild(el); })()");
        rt.eval(&js)?;
    }
    Ok(())
}

/// Seed/push pairs for the headless Convex client
#[derive(Default, Clone)]
pub struct ConvexData {
    /// Query seeds: (ref, json_data) — injected before app runs
    pub seeds: Vec<(String, String)>,
    /// Query pushes: (ref, json_data) — pushed after app init
    pub pushes: Vec<(String, String)>,
}

/// Source of an app: local file or remote URL
pub enum AppSource {
    Local { path: std::path::PathBuf, base_dir: std::path::PathBuf },
    Remote { url: Url, base_url: Url },
}

/// Fetch HTML from a URL (blocking)
fn fetch_url(url: &Url) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let resp = client
        .get(url.as_str())
        .header("Accept", "text/html")
        .send()
        .map_err(|e| format!("Failed to fetch {}: {e}", url))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} for {}", resp.status(), url));
    }
    resp.text().map_err(|e| format!("Failed to read response from {}: {e}", url))
}

/// Fetch a script from a URL (blocking)
fn fetch_script(url: &Url) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;
    let resp = client
        .get(url.as_str())
        .send()
        .map_err(|e| format!("Failed to fetch script {}: {e}", url))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} for script {}", resp.status(), url));
    }
    resp.text().map_err(|e| format!("Failed to read script {}: {e}", url))
}

/// Resolve an input string to an AppSource (URL or local path)
fn resolve_source(input: &str) -> AppSource {
    if input.starts_with("http://") || input.starts_with("https://") {
        if let Ok(url) = Url::parse(input) {
            let mut base = url.clone();
            // Base URL is the parent path
            let parent = base.path().rfind('/').map(|pos| base.path()[..=pos].to_string());
            if let Some(parent) = parent {
                base.set_path(&parent);
            }
            return AppSource::Remote { url, base_url: base };
        }
    }
    let path = Path::new(input);
    let base_dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
    AppSource::Local { path: path.to_path_buf(), base_dir }
}

/// Load HTML from an AppSource
fn load_html(source: &AppSource) -> Result<String, String> {
    match source {
        AppSource::Local { path, .. } => {
            std::fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
        }
        AppSource::Remote { url, .. } => fetch_url(url),
    }
}

/// Load a script relative to the source
fn load_script(source: &AppSource, src: &str) -> Result<String, String> {
    match source {
        AppSource::Local { base_dir, .. } => runtime::load_script_file(base_dir, src),
        AppSource::Remote { base_url, .. } => {
            let script_url = base_url.join(src)
                .map_err(|e| format!("Failed to resolve script URL '{}': {e}", src))?;
            fetch_script(&script_url)
        }
    }
}

/// Get URL string for schema
fn source_url(source: &AppSource) -> String {
    match source {
        AppSource::Local { path, .. } => {
            format!("file://{}", path.canonicalize().unwrap_or(path.clone()).display())
        }
        AppSource::Remote { url, .. } => url.to_string(),
    }
}

/// Browse with default (empty) Convex data
pub fn browse(file_path: &str) -> Result<synthesizer::BrowseSchema, String> {
    browse_with_convex(file_path, &ConvexData::default())
}

/// Browse a no∅ HTML file (or URL) and return a structured schema
pub fn browse_with_convex(file_path: &str, convex: &ConvexData) -> Result<synthesizer::BrowseSchema, String> {
    let source = resolve_source(file_path);
    let html = load_html(&source)?;

    // Parse HTML to extract scripts
    let parsed = parser::parse_html(&html);

    if !parsed.is_novoid_app {
        return Err(
            "Not a no∅ app (no Novoid references found). Phase 1 only supports no∅ apps."
                .to_string(),
        );
    }

    // Create QuickJS runtime with DOM polyfill
    let rt = runtime::NovoidRuntime::new()?;

    // Set up body elements in the DOM before scripts run
    setup_body_elements(&rt, &parsed)?;

    // Load external scripts (core.js, plugins)
    for src in &parsed.script_srcs {
        // Skip Convex CDN — not needed in headless mode
        if src.contains("unpkg.com") || src.contains("cdn.") {
            continue;
        }

        let code = load_script(&source, src)?;
        rt.eval(&code).map_err(|e| format!("{e} (loading {src})"))?;
    }

    // Load observer (after core, before app)
    rt.load_observer()?;

    // Seed Convex query data before app scripts run
    for (ref_name, data) in &convex.seeds {
        let js = format!(
            "__convex_headless.seed({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }

    // Execute inline scripts (app code)
    for (i, script) in parsed.inline_scripts.iter().enumerate() {
        rt.execute_app(script).map_err(|e| format!("{e} (in inline script #{})", i + 1))?;
    }

    // Flush any pending requestAnimationFrame callbacks (for onMount)
    rt.flush_rafs();

    // Push data to active subscriptions (simulates live updates after init)
    for (ref_name, data) in &convex.pushes {
        let js = format!(
            "__convex_headless.push({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }
    if !convex.pushes.is_empty() {
        rt.flush_rafs();
    }

    // Read results
    let result = rt.get_browse_result();

    if let Some(err) = &result.error {
        return Err(err.clone());
    }

    let observed_json = result
        .observed_json
        .ok_or_else(|| "No observed data available".to_string())?;

    let url = source_url(&source);

    synthesizer::synthesize(&url, &observed_json, result.console_json.as_deref(), result.uncaught_json.as_deref(), result.convex_json.as_deref())
}

/// Browse a file (or URL) and call an action, returning the updated state
pub fn browse_and_call(
    file_path: &str,
    action_name: &str,
    args_json: &str,
) -> Result<synthesizer::BrowseSchema, String> {
    let source = resolve_source(file_path);
    let html = load_html(&source)?;

    let parsed = parser::parse_html(&html);

    if !parsed.is_novoid_app {
        return Err("Not a no∅ app".to_string());
    }

    let rt = runtime::NovoidRuntime::new()?;

    setup_body_elements(&rt, &parsed)?;

    for src in &parsed.script_srcs {
        if src.contains("unpkg.com") || src.contains("cdn.") {
            continue;
        }
        let code = load_script(&source, src)?;
        rt.eval(&code).map_err(|e| format!("{e} (loading {src})"))?;
    }

    rt.load_observer()?;

    for script in &parsed.inline_scripts {
        rt.execute_app(script)?;
    }

    rt.flush_rafs();

    // Normalize args: if not an array, wrap as single-element array
    let args_array = {
        let parsed: serde_json::Value = serde_json::from_str(args_json).unwrap_or(serde_json::Value::Null);
        match parsed {
            serde_json::Value::Array(_) => args_json.to_string(),
            _ => format!("[{}]", args_json),
        }
    };

    // Call the action via observer's callAction helper
    let action_js = format!(
        r#"(function() {{
            const idx = __novoid_observed.findAction("{action_name}");
            if (idx < 0) return JSON.stringify({{ ok: false, error: "action not found: {action_name}" }});
            const result = __novoid_observed.callAction(idx, "{action_name}", {args_array});
            return JSON.stringify(result);
        }})()"#,
        action_name = action_name,
        args_array = args_array,
    );

    let call_result = rt.call_action(&action_js)?;
    let sanitized_result = runtime::sanitize_json(&call_result);
    let call_obj: serde_json::Value = serde_json::from_str(&sanitized_result).unwrap_or_default();
    if let Some(false) = call_obj.get("ok").and_then(|v| v.as_bool()) {
        let err_msg = call_obj.get("error").and_then(|v| v.as_str()).unwrap_or("unknown error");
        return Err(format!("Action '{}' failed: {}", action_name, err_msg));
    }
    rt.flush_rafs();

    // Read updated state
    let result = rt.get_browse_result();
    let observed_json = result
        .observed_json
        .ok_or_else(|| "No observed data after action".to_string())?;

    let url = source_url(&source);
    synthesizer::synthesize(&url, &observed_json, result.console_json.as_deref(), result.uncaught_json.as_deref(), result.convex_json.as_deref())
}

/// Result of a single assertion
#[derive(Debug)]
pub struct AssertResult {
    pub expr: String,
    pub pass: bool,
    pub detail: String,
}

/// Browse a file and run assertions against the app state
pub fn browse_and_assert(file_path: &str, assertions: &[String]) -> Result<Vec<AssertResult>, String> {
    browse_and_assert_with_convex(file_path, assertions, &ConvexData::default())
}

/// Browse a file (or URL) with Convex data and run assertions against the app state
pub fn browse_and_assert_with_convex(file_path: &str, assertions: &[String], convex: &ConvexData) -> Result<Vec<AssertResult>, String> {
    let source = resolve_source(file_path);
    let html = load_html(&source)?;

    let parsed = parser::parse_html(&html);

    if !parsed.is_novoid_app {
        return Err("Not a no∅ app".to_string());
    }

    let rt = runtime::NovoidRuntime::new()?;

    setup_body_elements(&rt, &parsed)?;

    for src in &parsed.script_srcs {
        if src.contains("unpkg.com") || src.contains("cdn.") {
            continue;
        }
        let code = load_script(&source, src)?;
        rt.eval(&code).map_err(|e| format!("{e} (loading {src})"))?;
    }

    rt.load_observer()?;

    // Seed Convex query data before app scripts
    for (ref_name, data) in &convex.seeds {
        let js = format!(
            "__convex_headless.seed({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }

    for script in &parsed.inline_scripts {
        rt.execute_app(script)?;
    }

    rt.flush_rafs();

    // Push data to active subscriptions after init
    for (ref_name, data) in &convex.pushes {
        let js = format!(
            "__convex_headless.push({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }
    if !convex.pushes.is_empty() {
        rt.flush_rafs();
    }

    // Build state object accessible to assertions
    // Expose signals, stores, and a helper `state` object
    rt.eval(r#"
        (function() {
            const obs = __novoid_observed;
            const s = obs.getSignals();
            const st = obs.getStores();
            globalThis.__assert_state = {};
            for (const sig of s) {
                const key = sig.name || ('signal_' + sig.id);
                globalThis.__assert_state[key] = sig.value;
            }
            for (let i = 0; i < st.length; i++) {
                const key = 'store_' + i;
                globalThis.__assert_state[key] = st[i].state;
            }
        })()
    "#)?;

    // Set state keys as globals for assertions
    rt.eval(r#"
        (function() {
            const __s = globalThis.__assert_state;
            for (const k of Object.keys(__s)) {
                globalThis[k] = __s[k];
            }
        })()
    "#)?;

    let mut results = Vec::new();
    for expr in assertions {
        let js = format!(
            r#"(function() {{
                try {{
                    const result = ({expr});
                    return JSON.stringify({{ pass: !!result, value: result }});
                }} catch(e) {{
                    return JSON.stringify({{ pass: false, value: null, error: e.message || String(e) }});
                }}
            }})()"#,
            expr = expr,
        );
        match rt.eval_string(&js) {
            Ok(json) => {
                let obj: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
                let pass = obj.get("pass").and_then(|v| v.as_bool()).unwrap_or(false);
                let detail = if let Some(err) = obj.get("error").and_then(|v| v.as_str()) {
                    format!("error: {}", err)
                } else {
                    let val = obj.get("value").unwrap_or(&serde_json::Value::Null);
                    format!("{}", val)
                };
                results.push(AssertResult { expr: expr.clone(), pass, detail });
            }
            Err(e) => {
                results.push(AssertResult { expr: expr.clone(), pass: false, detail: format!("eval error: {}", e) });
            }
        }
    }

    Ok(results)
}

/// Browse and run a test spec (MCP test harness)
pub fn browse_and_test(file_path: &str, spec: &test_runner::TestSpec, convex: &ConvexData) -> Result<test_runner::TestReport, String> {
    let source = resolve_source(file_path);
    let html = load_html(&source)?;

    let parsed = parser::parse_html(&html);

    if !parsed.is_novoid_app {
        return Err("Not a no∅ app".to_string());
    }

    let rt = runtime::NovoidRuntime::new()?;

    setup_body_elements(&rt, &parsed)?;

    for src in &parsed.script_srcs {
        if src.contains("unpkg.com") || src.contains("cdn.") {
            continue;
        }
        let code = load_script(&source, src)?;
        rt.eval(&code).map_err(|e| format!("{e} (loading {src})"))?;
    }

    rt.load_observer()?;

    // Seed from test spec
    for (ref_name, data) in &spec.seed {
        let js = format!(
            "__convex_headless.seed({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }

    // Also seed from ConvexData (CLI --seed args)
    for (ref_name, data) in &convex.seeds {
        let js = format!(
            "__convex_headless.seed({}, {})",
            serde_json::to_string(ref_name).unwrap(),
            data
        );
        rt.eval(&js)?;
    }

    // Execute inline scripts (app code)
    for script in &parsed.inline_scripts {
        rt.execute_app(script)?;
    }

    rt.flush_rafs();

    // Run test steps
    Ok(test_runner::run_tests(&rt, spec))
}
