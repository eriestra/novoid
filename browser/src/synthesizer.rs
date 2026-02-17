use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The full output schema of the browser
#[derive(Debug, Serialize, Deserialize)]
pub struct BrowseSchema {
    pub url: String,
    pub state: Value,
    pub actions: Vec<ActionSchema>,
    pub entities: Value,
    pub navigation: Vec<RouteSchema>,
    pub components: Vec<String>,
    pub forms: Vec<FormSchema>,
    pub errors: Vec<ErrorEntry>,
    pub console: Vec<ConsoleEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub convex: Option<ConvexState>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvexState {
    pub subscriptions: Vec<ConvexSubscription>,
    pub mutations: Vec<ConvexCall>,
    pub actions: Vec<ConvexCall>,
    pub seeds: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvexSubscription {
    #[serde(rename = "ref")]
    pub query_ref: String,
    pub args: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvexCall {
    #[serde(rename = "ref")]
    pub call_ref: String,
    pub args: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionSchema {
    pub name: String,
    pub source: String,
    pub confidence: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouteSchema {
    pub path: String,
    #[serde(rename = "hasGuard")]
    pub has_guard: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormSchema {
    pub id: usize,
    pub fields: Vec<String>,
    pub schema: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorEntry {
    pub message: String,
    pub component: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsoleEntry {
    pub level: String,
    pub args: Vec<String>,
}

/// Raw observed data from JS
#[derive(Debug, Deserialize)]
struct ObservedData {
    signals: Vec<ObservedSignal>,
    stores: Vec<ObservedStore>,
    components: Vec<String>,
    routes: Vec<ObservedRoute>,
    forms: Vec<ObservedForm>,
    errors: Vec<ObservedError>,
    #[serde(default)]
    queries: Vec<ObservedConvexRef>,
    #[serde(default)]
    mutations: Vec<ObservedConvexRef>,
    #[serde(default)]
    actions: Vec<ObservedConvexRef>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ObservedConvexRef {
    #[serde(rename = "ref")]
    ref_name: String,
    #[serde(default)]
    args: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ObservedSignal {
    id: usize,
    value: Value,
    #[serde(rename = "initialValue")]
    initial_value: Value,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ObservedStore {
    id: usize,
    state: Value,
    actions: Vec<String>,
    #[serde(rename = "initialState")]
    initial_state: Value,
}

#[derive(Debug, Deserialize)]
struct ObservedRoute {
    path: String,
    #[serde(rename = "hasGuard")]
    has_guard: bool,
}

#[derive(Debug, Deserialize)]
struct ObservedForm {
    id: usize,
    fields: Vec<String>,
    schema: Value,
}

#[derive(Debug, Deserialize)]
struct ObservedError {
    message: String,
    component: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UncaughtError {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
    #[allow(dead_code)]
    stack: String,
}

/// Synthesize a BrowseSchema from raw observed JSON
pub fn synthesize(
    url: &str,
    observed_json: &str,
    console_json: Option<&str>,
    uncaught_json: Option<&str>,
    convex_json: Option<&str>,
) -> Result<BrowseSchema, String> {
    let observed: ObservedData =
        serde_json::from_str(observed_json).map_err(|e| format!("Failed to parse observed data: {e}"))?;

    // Build state from signals and stores
    let mut state = serde_json::Map::new();

    for (i, sig) in observed.signals.iter().enumerate() {
        let key = sig
            .name
            .clone()
            .unwrap_or_else(|| format!("signal_{}", i));
        state.insert(key, sig.value.clone());
    }

    for (i, store) in observed.stores.iter().enumerate() {
        let key = format!("store_{}", i);
        state.insert(key, store.state.clone());
    }

    // Build actions from stores
    let mut actions = Vec::new();
    for (i, store) in observed.stores.iter().enumerate() {
        for action_name in &store.actions {
            actions.push(ActionSchema {
                name: action_name.clone(),
                source: format!("store_{}", i),
                confidence: 1.0,
            });
        }
    }

    // Build entities (heuristic: any value that's an array of objects, including nested)
    let mut entities = serde_json::Map::new();
    fn find_entities(prefix: &str, val: &Value, entities: &mut serde_json::Map<String, Value>) {
        match val {
            Value::Array(arr) if !arr.is_empty() => {
                if let Some(Value::Object(obj)) = arr.first() {
                    let schema: serde_json::Map<String, Value> = obj
                        .keys()
                        .map(|k| {
                            let v = &obj[k];
                            let type_str = match v {
                                Value::String(_) => "string",
                                Value::Number(_) => "number",
                                Value::Bool(_) => "boolean",
                                Value::Array(_) => "array",
                                Value::Object(_) => "object",
                                Value::Null => "null",
                            };
                            (k.clone(), Value::String(type_str.to_string()))
                        })
                        .collect();
                    let mut entity = serde_json::Map::new();
                    entity.insert("schema".to_string(), Value::Object(schema));
                    entity.insert("count".to_string(), Value::Number(arr.len().into()));
                    entities.insert(prefix.to_string(), Value::Object(entity));
                }
            }
            Value::Object(obj) => {
                for (k, v) in obj {
                    let path = if prefix.is_empty() { k.clone() } else { format!("{}.{}", prefix, k) };
                    find_entities(&path, v, entities);
                }
            }
            _ => {}
        }
    }
    for (key, val) in &state {
        find_entities(key, val, &mut entities);
    }

    // Navigation from routes
    let navigation: Vec<RouteSchema> = observed
        .routes
        .iter()
        .map(|r| RouteSchema {
            path: r.path.clone(),
            has_guard: r.has_guard,
        })
        .collect();

    // Forms
    let forms: Vec<FormSchema> = observed
        .forms
        .iter()
        .map(|f| FormSchema {
            id: f.id,
            fields: f.fields.clone(),
            schema: f.schema.clone(),
        })
        .collect();

    // Errors — framework errors + uncaught errors
    let mut errors: Vec<ErrorEntry> = observed
        .errors
        .iter()
        .map(|e| ErrorEntry {
            message: e.message.clone(),
            component: e.component.clone(),
        })
        .collect();

    // Merge uncaught errors
    if let Some(uj) = uncaught_json {
        if let Ok(uncaught) = serde_json::from_str::<Vec<UncaughtError>>(uj) {
            for ue in uncaught {
                errors.push(ErrorEntry {
                    message: format!("[{}] {}", ue.error_type, ue.message),
                    component: None,
                });
            }
        }
    }

    // Console
    let console: Vec<ConsoleEntry> = if let Some(cj) = console_json {
        serde_json::from_str(cj).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Promote console.error entries to errors (catches framework-logged errors)
    for entry in &console {
        if entry.level == "error" {
            let msg = entry.args.join(" ");
            // Avoid duplicates from uncaught errors already captured
            if !errors.iter().any(|e| msg.contains(&e.message) || e.message.contains(&msg)) {
                errors.push(ErrorEntry {
                    message: msg,
                    component: None,
                });
            }
        }
    }

    // Parse Convex headless state (from mock) and merge observer registrations
    let mut convex = convex_json.and_then(|cj| {
        serde_json::from_str::<ConvexState>(cj).ok()
    }).unwrap_or(ConvexState {
        subscriptions: vec![],
        mutations: vec![],
        actions: vec![],
        seeds: vec![],
    });

    // Merge observer-tracked registrations (useMutation/useAction calls at init)
    // These are registrations, not invocations — the mock only tracks invocations
    for m in &observed.mutations {
        if !convex.mutations.iter().any(|c| c.call_ref == m.ref_name) {
            convex.mutations.push(ConvexCall {
                call_ref: m.ref_name.clone(),
                args: Value::Null,
            });
        }
    }
    for a in &observed.actions {
        if !convex.actions.iter().any(|c| c.call_ref == a.ref_name) {
            convex.actions.push(ConvexCall {
                call_ref: a.ref_name.clone(),
                args: Value::Null,
            });
        }
    }

    let convex = if convex.subscriptions.is_empty() && convex.mutations.is_empty() && convex.actions.is_empty() {
        None
    } else {
        Some(convex)
    };

    Ok(BrowseSchema {
        url: url.to_string(),
        state: Value::Object(state),
        actions,
        entities: Value::Object(entities),
        navigation,
        components: observed.components,
        forms,
        errors,
        console,
        convex,
    })
}
