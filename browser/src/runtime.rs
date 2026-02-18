use rquickjs::{Context, Runtime, Value};
use std::path::Path;

const DOM_POLYFILL: &str = include_str!("../js/dom-polyfill.js");
const CONVEX_MOCK: &str = include_str!("../js/convex-mock.js");
const OBSERVER: &str = include_str!("../js/observer.js");

/// Escape raw control characters inside JSON string values.
/// QuickJS's JSON.stringify escapes them, but the rquickjs bridge
/// can lose the escaping when extracting JS strings to Rust.
pub fn sanitize_json(s: &str) -> String {
    let bytes = s.as_bytes();
    // Fast path: no control characters → return as-is
    if !bytes.iter().any(|&b| b < 0x20) {
        return s.to_string();
    }
    let mut out = Vec::with_capacity(bytes.len());
    let mut in_string = false;
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\\' && in_string && i + 1 < bytes.len() {
            out.push(b);
            i += 1;
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        if b == b'"' {
            in_string = !in_string;
        }
        if in_string && b < 0x20 {
            let esc = format!("\\u{:04x}", b);
            out.extend_from_slice(esc.as_bytes());
        } else {
            out.push(b);
        }
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// QuickJS runtime wrapper for executing no∅ apps
pub struct NovoidRuntime {
    #[allow(dead_code)]
    runtime: Runtime,
    context: Context,
}

/// Result of browsing a page
#[derive(Debug)]
pub struct BrowseResult {
    /// JSON string from __novoid_observed.getAll()
    pub observed_json: Option<String>,
    /// Captured console output JSON
    pub console_json: Option<String>,
    /// Uncaught errors JSON
    pub uncaught_json: Option<String>,
    /// Headless Convex state JSON
    pub convex_json: Option<String>,
    /// Any error that occurred during execution
    pub error: Option<String>,
}

impl NovoidRuntime {
    /// Create a new runtime with DOM polyfill loaded
    pub fn new() -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| format!("Failed to create QuickJS runtime: {e}"))?;
        let context = Context::full(&runtime)
            .map_err(|e| format!("Failed to create QuickJS context: {e}"))?;

        // Load DOM polyfill + Convex mock
        context.with(|ctx| {
            ctx.eval::<Value, _>(DOM_POLYFILL)
                .map_err(|e| format!("DOM polyfill error: {e}"))?;
            ctx.eval::<Value, _>(CONVEX_MOCK)
                .map_err(|e| format!("Convex mock error: {e}"))?;
            Ok::<(), String>(())
        })?;

        Ok(Self { runtime, context })
    }

    /// Load and execute a JavaScript source string
    pub fn eval(&self, code: &str) -> Result<(), String> {
        self.context.with(|ctx| {
            ctx.eval::<Value, _>(code)
                .map_err(|e| format!("JS eval error: {e}"))?;
            Ok(())
        })
    }

    /// Load the Novoid core framework
    pub fn load_core(&self, core_js: &str) -> Result<(), String> {
        self.eval(core_js)
    }

    /// Load the observer instrumentation (must be after core, before app)
    pub fn load_observer(&self) -> Result<(), String> {
        self.eval(OBSERVER)
    }

    /// Load a plugin script (router, convex, auth, toast)
    pub fn load_plugin(&self, plugin_js: &str) -> Result<(), String> {
        self.eval(plugin_js)
    }

    /// Execute the app's inline script, capturing uncaught errors
    pub fn execute_app(&self, app_js: &str) -> Result<(), String> {
        // Wrap in try/catch to capture uncaught errors without aborting
        let wrapped = format!(
            r#"try {{ {} }} catch(__e) {{ __novoid_browser.captureError('uncaught', __e.message || String(__e), __e.stack || ''); }}"#,
            app_js
        );
        self.eval(&wrapped)
    }

    /// Call a store action by name with JSON args
    pub fn call_action(&self, action_call_js: &str) -> Result<String, String> {
        self.context.with(|ctx| {
            let _result = ctx
                .eval::<Value, _>(action_call_js)
                .map_err(|e| format!("Action call error: {e}"))?;
            // Read updated state after action
            let state = ctx
                .eval::<String, _>("__novoid_observed.getAll()")
                .map_err(|e| format!("Failed to read state after action: {e}"))?;
            Ok(state)
        })
    }

    /// Eval JS and return the string result (handles null/undefined → "null")
    pub fn eval_string(&self, code: &str) -> Result<String, String> {
        self.context.with(|ctx| {
            let value = ctx
                .eval::<Value, _>(code)
                .map_err(|e| format!("JS eval error: {e}"))?;
            if value.is_null() || value.is_undefined() {
                return Ok("null".to_string());
            }
            value
                .as_string()
                .ok_or_else(|| "JS eval error: return value is not a string".to_string())?
                .to_string()
                .map_err(|e| format!("JS eval error: {e}"))
        })
    }

    /// Read the observed state after execution
    pub fn get_browse_result(&self) -> BrowseResult {
        self.context.with(|ctx| {
            let observed_json = ctx
                .eval::<String, _>("__novoid_observed.getAll()")
                .ok();

            let console_json = ctx
                .eval::<String, _>("__novoid_browser.getCapturedConsole()")
                .ok();

            let uncaught_json = ctx
                .eval::<String, _>("__novoid_browser.getUncaughtErrors()")
                .ok();

            let convex_json = ctx
                .eval::<String, _>("__convex_headless.getAll()")
                .ok();

            let error = if observed_json.is_none() {
                Some("Failed to read observed state — Novoid may not have loaded".to_string())
            } else {
                None
            };

            BrowseResult {
                observed_json,
                console_json,
                uncaught_json,
                convex_json,
                error,
            }
        })
    }

    /// Read the headless Convex client state
    pub fn get_convex_state(&self) -> Option<String> {
        self.context.with(|ctx| {
            ctx.eval::<String, _>("__convex_headless.getAll()")
                .ok()
        })
    }

    /// Flush any pending requestAnimationFrame callbacks
    pub fn flush_rafs(&self) {
        self.context.with(|ctx| {
            let _: Result<(), _> = ctx.eval::<(), _>("__novoid_browser.flushRAFs()");
        });
    }
}

/// Load a script file from disk, resolving relative paths against a base dir
pub fn load_script_file(base_dir: &Path, src: &str) -> Result<String, String> {
    let path = base_dir.join(src);
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read script {}: {e}", path.display()))
}
