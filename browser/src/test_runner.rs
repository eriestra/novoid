use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

use crate::runtime::NovoidRuntime;

/// A test specification loaded from JSON
#[derive(Debug, Deserialize)]
pub struct TestSpec {
    #[serde(default)]
    pub seed: std::collections::HashMap<String, Value>,
    pub steps: Vec<TestStep>,
}

#[derive(Debug, Deserialize)]
pub struct TestStep {
    pub action: String,
    #[serde(default)]
    pub resource: Option<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub args: Option<Value>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(rename = "assert", default)]
    pub assertion: Option<Assertion>,
    #[serde(default)]
    pub then: Option<ThenClause>,
}

#[derive(Debug, Deserialize)]
pub struct ThenClause {
    #[serde(default)]
    pub read: Option<String>,
    #[serde(rename = "assert", default)]
    pub assertion: Option<Assertion>,
}

#[derive(Debug, Deserialize)]
pub struct Assertion {
    #[serde(default)]
    pub eq: Option<Value>,
    #[serde(default)]
    pub length: Option<usize>,
    #[serde(default)]
    pub contains: Option<Value>,
    #[serde(default)]
    pub matches: Option<String>,
}

/// Result of running the full test suite
#[derive(Debug, Serialize)]
pub struct TestReport {
    pub passed: bool,
    pub steps: Vec<StepResult>,
    pub errors: Vec<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct StepResult {
    pub step: usize,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Parse a test spec from JSON string
pub fn parse_spec(json: &str) -> Result<TestSpec, String> {
    serde_json::from_str(json).map_err(|e| format!("Failed to parse test spec: {e}"))
}

/// Run test steps against an already-initialized runtime
pub fn run_tests(rt: &NovoidRuntime, spec: &TestSpec) -> TestReport {
    let start = Instant::now();
    let mut results = Vec::new();
    let mut errors = Vec::new();
    let mut all_pass = true;

    // Expose state reading helper
    if let Err(e) = rt.eval(r#"
        globalThis.__test_read_resource = function(name) {
            const obs = __novoid_observed;
            const sigs = obs.getSignals();
            const stores = obs.getStores();
            // Try named signal first
            for (const s of sigs) {
                if ((s.name || ('signal_' + s.id)) === name) return JSON.stringify(s.value);
            }
            // Try store state key
            for (let i = 0; i < stores.length; i++) {
                const key = 'store_' + i;
                if (key === name) return JSON.stringify(stores[i].state);
                // Check nested keys in store state
                if (typeof stores[i].state === 'object' && stores[i].state !== null) {
                    if (name in stores[i].state) return JSON.stringify(stores[i].state[name]);
                }
            }
            // Try as a path into any store state
            for (let i = 0; i < stores.length; i++) {
                const parts = name.split('.');
                let cur = stores[i].state;
                let found = true;
                for (const p of parts) {
                    if (cur && typeof cur === 'object' && p in cur) {
                        cur = cur[p];
                    } else {
                        found = false;
                        break;
                    }
                }
                if (found) return JSON.stringify(cur);
            }
            return null;
        };
    "#) {
        errors.push(format!("Failed to set up test helpers: {e}"));
        return TestReport { passed: false, steps: results, errors, duration_ms: start.elapsed().as_millis() as u64 };
    }

    for (i, step) in spec.steps.iter().enumerate() {
        let result = execute_step(rt, i, step);
        if !result.passed {
            all_pass = false;
            if let Some(ref e) = result.error {
                errors.push(format!("step {}: {}", i, e));
            }
        }
        results.push(result);
    }

    TestReport {
        passed: all_pass,
        steps: results,
        errors,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

fn execute_step(rt: &NovoidRuntime, idx: usize, step: &TestStep) -> StepResult {
    match step.action.as_str() {
        "read" => execute_read(rt, idx, step),
        "call" => execute_call(rt, idx, step),
        "push" => execute_push(rt, idx, step),
        _ => StepResult {
            step: idx,
            action: step.action.clone(),
            resource: None,
            tool: None,
            passed: false,
            actual: None,
            error: Some(format!("Unknown action: {}", step.action)),
        },
    }
}

fn execute_read(rt: &NovoidRuntime, idx: usize, step: &TestStep) -> StepResult {
    let resource = match &step.resource {
        Some(r) => r.clone(),
        None => return StepResult {
            step: idx, action: "read".into(), resource: None, tool: None,
            passed: false, actual: None, error: Some("Missing 'resource' field".into()),
        },
    };

    let val = read_resource(rt, &resource);
    let actual = match &val {
        Ok(v) => Some(v.clone()),
        Err(_) => None,
    };

    let passed = match (&val, &step.assertion) {
        (Ok(v), Some(a)) => check_assertion(v, a),
        (Ok(_), None) => true,
        (Err(_), _) => false,
    };

    let error = match &val {
        Err(e) => Some(e.clone()),
        Ok(_) if !passed => Some("Assertion failed".into()),
        _ => None,
    };

    StepResult { step: idx, action: "read".into(), resource: Some(resource), tool: None, passed, actual, error }
}

fn execute_call(rt: &NovoidRuntime, idx: usize, step: &TestStep) -> StepResult {
    let tool = match &step.tool {
        Some(t) => t.clone(),
        None => return StepResult {
            step: idx, action: "call".into(), resource: None, tool: None,
            passed: false, actual: None, error: Some("Missing 'tool' field".into()),
        },
    };

    let args = step.args.as_ref().map(|a| a.to_string()).unwrap_or_else(|| "{}".into());

    // Normalize args to array
    let args_array = match serde_json::from_str::<Value>(&args) {
        Ok(Value::Array(_)) => args.clone(),
        Ok(_) => format!("[{}]", args),
        Err(_) => "[{}]".into(),
    };

    let call_js = format!(
        r#"(function() {{
            const idx = __novoid_observed.findAction("{tool}");
            if (idx < 0) return JSON.stringify({{ ok: false, error: "action not found: {tool}" }});
            const result = __novoid_observed.callAction(idx, "{tool}", {args_array});
            return JSON.stringify(result);
        }})()"#,
        tool = tool,
        args_array = args_array,
    );

    match rt.eval_string(&call_js) {
        Ok(result_json) => {
            let sanitized = crate::runtime::sanitize_json(&result_json);
            let call_obj: Value = serde_json::from_str(&sanitized).unwrap_or_default();
            if let Some(false) = call_obj.get("ok").and_then(|v| v.as_bool()) {
                let err = call_obj.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");
                return StepResult {
                    step: idx, action: "call".into(), resource: None, tool: Some(tool),
                    passed: false, actual: None, error: Some(err.to_string()),
                };
            }
            rt.flush_rafs();

            // Check 'then' clause if present
            if let Some(then) = &step.then {
                if let Some(read_resource) = &then.read {
                    let val = read_resource_fn(rt, read_resource);
                    let passed = match (&val, &then.assertion) {
                        (Ok(v), Some(a)) => check_assertion(v, a),
                        (Ok(_), None) => true,
                        (Err(_), _) => false,
                    };
                    let error = match &val {
                        Err(e) => Some(e.clone()),
                        Ok(_) if !passed => Some("Then assertion failed".into()),
                        _ => None,
                    };
                    return StepResult {
                        step: idx, action: "call".into(), resource: Some(read_resource.clone()),
                        tool: Some(tool), passed, actual: val.ok(), error,
                    };
                }
            }

            StepResult { step: idx, action: "call".into(), resource: None, tool: Some(tool), passed: true, actual: None, error: None }
        }
        Err(e) => StepResult {
            step: idx, action: "call".into(), resource: None, tool: Some(tool),
            passed: false, actual: None, error: Some(e),
        },
    }
}

fn execute_push(rt: &NovoidRuntime, idx: usize, step: &TestStep) -> StepResult {
    let query = match &step.query {
        Some(q) => q.clone(),
        None => return StepResult {
            step: idx, action: "push".into(), resource: None, tool: None,
            passed: false, actual: None, error: Some("Missing 'query' field".into()),
        },
    };

    let data = step.data.as_ref().map(|d| d.to_string()).unwrap_or_else(|| "[]".into());

    let push_js = format!(
        "__convex_headless.push({}, {})",
        serde_json::to_string(&query).unwrap(),
        data
    );

    if let Err(e) = rt.eval(&push_js) {
        return StepResult {
            step: idx, action: "push".into(), resource: None, tool: None,
            passed: false, actual: None, error: Some(e),
        };
    }
    rt.flush_rafs();

    // Check 'then' clause
    if let Some(then) = &step.then {
        if let Some(read_resource) = &then.read {
            let val = read_resource_fn(rt, read_resource);
            let passed = match (&val, &then.assertion) {
                (Ok(v), Some(a)) => check_assertion(v, a),
                (Ok(_), None) => true,
                (Err(_), _) => false,
            };
            let error = match &val {
                Err(e) => Some(e.clone()),
                Ok(_) if !passed => Some("Then assertion failed".into()),
                _ => None,
            };
            return StepResult {
                step: idx, action: "push".into(), resource: Some(read_resource.clone()),
                tool: None, passed, actual: val.ok(), error,
            };
        }
    }

    StepResult { step: idx, action: "push".into(), resource: Some(query), tool: None, passed: true, actual: None, error: None }
}

fn read_resource(rt: &NovoidRuntime, name: &str) -> Result<Value, String> {
    read_resource_fn(rt, name)
}

fn read_resource_fn(rt: &NovoidRuntime, name: &str) -> Result<Value, String> {
    // Strip novoid:// URI prefix to extract signal/store name
    // e.g. "novoid://test-counter/state/count" → "count"
    //      "novoid://test-kanban/entity/store_0.columns" → "store_0.columns"
    let key = if let Some(rest) = name.strip_prefix("novoid://") {
        rest.split('/').skip(2).collect::<Vec<_>>().join("/")
    } else {
        name.to_string()
    };
    let js = format!(
        r#"__test_read_resource("{}")"#,
        key.replace('\\', "\\\\").replace('"', "\\\"")
    );
    match rt.eval_string(&js) {
        Ok(json_str) => {
            if json_str == "null" || json_str.is_empty() {
                Err(format!("Resource '{}' not found", name))
            } else {
                let sanitized = crate::runtime::sanitize_json(&json_str);
                serde_json::from_str(&sanitized)
                    .map_err(|e| format!("Failed to parse resource '{}': {e}", name))
            }
        }
        Err(e) => Err(e),
    }
}

fn check_assertion(actual: &Value, assertion: &Assertion) -> bool {
    if let Some(expected) = &assertion.eq {
        if actual != expected {
            return false;
        }
    }
    if let Some(expected_len) = assertion.length {
        if let Some(arr) = actual.as_array() {
            if arr.len() != expected_len {
                return false;
            }
        } else {
            return false;
        }
    }
    if let Some(needle) = &assertion.contains {
        if let Some(arr) = actual.as_array() {
            if !arr.contains(needle) {
                return false;
            }
        } else if let Some(s) = actual.as_str() {
            if let Some(needle_str) = needle.as_str() {
                if !s.contains(needle_str) {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            return false;
        }
    }
    if let Some(pattern) = &assertion.matches {
        if let Some(s) = actual.as_str() {
            // Simple glob-like matching: just check contains for now
            if !s.contains(pattern.trim_matches('*')) {
                return false;
            }
        } else {
            return false;
        }
    }
    true
}

/// Output the test report as peek (human-readable) format
pub fn output_peek(report: &TestReport) {
    eprintln!("┌─ test ────────────────────────────────────────────┐");
    for r in &report.steps {
        let icon = if r.passed { "✓" } else { "✗" };
        let color = if r.passed { "\x1b[32m" } else { "\x1b[31m" };
        let reset = "\x1b[0m";

        let detail = match (&r.action[..], &r.resource, &r.tool, &r.actual) {
            ("read", Some(res), _, Some(val)) => format!("read {} = {}", res, val),
            ("read", Some(res), _, None) => format!("read {}", res),
            ("call", Some(res), Some(tool), Some(val)) => format!("call {} → {} = {}", tool, res, val),
            ("call", _, Some(tool), _) => format!("call {}", tool),
            ("push", Some(res), _, Some(val)) => format!("push {} → {}", res, val),
            ("push", Some(res), _, None) => format!("push {}", res),
            _ => format!("{}", r.action),
        };

        if r.passed {
            eprintln!("│ {color}{icon}{reset} step {}  {detail}", r.step);
        } else {
            let err = r.error.as_deref().unwrap_or("assertion failed");
            eprintln!("│ {color}{icon}{reset} step {}  {detail} — {err}", r.step);
        }
    }
    let total = report.steps.len();
    let passed = report.steps.iter().filter(|r| r.passed).count();
    eprintln!("├───────────────────────────────────────────────────────┤");
    if report.passed {
        eprintln!("│ \x1b[32m✓ {}/{} passed ({}ms)\x1b[0m", passed, total, report.duration_ms);
    } else {
        eprintln!("│ \x1b[31m✗ {}/{} passed ({}ms)\x1b[0m", passed, total, report.duration_ms);
    }
    eprintln!("└───────────────────────────────────────────────────────┘");
}
