use clap::Parser;

/// no∅ browser — headless runtime that turns no∅ apps into typed APIs
#[derive(Parser)]
#[command(name = "novoid-browser", version, about)]
struct Cli {
    /// Path to an HTML file or URL to browse
    file: String,

    /// Run MCP test spec: --test <spec.json>
    #[arg(long, value_name = "SPEC")]
    test: Option<String>,

    /// Call a store action: --call <action> '<json_args>'
    #[arg(long, num_args = 1..=2, value_names = ["ACTION", "ARGS"])]
    call: Option<Vec<String>>,

    /// Observe a specific state path (prints value and exits)
    #[arg(long)]
    observe: Option<String>,

    /// Human-readable peek view
    #[arg(long)]
    peek: bool,

    /// Compact JSON output (no pretty-printing)
    #[arg(long, short)]
    compact: bool,

    /// Assert a JS expression against the browsed state (exit 0 = pass, 1 = fail)
    #[arg(long, num_args = 1..)]
    assert: Option<Vec<String>>,

    /// Seed Convex query data: --seed <query_ref> '<json_data>'
    /// Can be repeated: --seed "pages:list" '[{"slug":"foo"}]' --seed "jobs:stream" '[]'
    #[arg(long, num_args = 2, value_names = ["REF", "DATA"], action = clap::ArgAction::Append)]
    seed: Option<Vec<String>>,

    /// Push data to a query subscription after app init: --push <query_ref> '<json_data>'
    #[arg(long, num_args = 2, value_names = ["REF", "DATA"], action = clap::ArgAction::Append)]
    push: Option<Vec<String>>,
}

fn parse_convex_data(cli: &Cli) -> novoid_browser::ConvexData {
    let mut data = novoid_browser::ConvexData::default();
    if let Some(seeds) = &cli.seed {
        for pair in seeds.chunks(2) {
            if pair.len() == 2 {
                data.seeds.push((pair[0].clone(), pair[1].clone()));
            }
        }
    }
    if let Some(pushes) = &cli.push {
        for pair in pushes.chunks(2) {
            if pair.len() == 2 {
                data.pushes.push((pair[0].clone(), pair[1].clone()));
            }
        }
    }
    data
}

fn main() {
    let cli = Cli::parse();

    // --test: run MCP test spec
    if let Some(spec_path) = &cli.test {
        let spec_json = std::fs::read_to_string(spec_path)
            .unwrap_or_else(|e| { eprintln!("Error reading spec: {e}"); std::process::exit(1); });
        let spec = novoid_browser::test_runner::parse_spec(&spec_json)
            .unwrap_or_else(|e| { eprintln!("Error parsing spec: {e}"); std::process::exit(1); });
        let convex_data = parse_convex_data(&cli);
        match novoid_browser::browse_and_test(&cli.file, &spec, &convex_data) {
            Ok(report) => {
                if cli.peek {
                    novoid_browser::test_runner::output_peek(&report);
                } else if cli.compact {
                    println!("{}", serde_json::to_string(&report).unwrap());
                } else {
                    println!("{}", serde_json::to_string_pretty(&report).unwrap());
                }
                std::process::exit(if report.passed { 0 } else { 1 });
            }
            Err(e) => {
                eprintln!("Error: {e}");
                std::process::exit(1);
            }
        }
    }

    if let Some(call_args) = &cli.call {
        let action = &call_args[0];
        let args = call_args.get(1).map(|s| s.as_str()).unwrap_or("{}");

        match novoid_browser::browse_and_call(&cli.file, action, args) {
            Ok(schema) => output(&cli, &schema),
            Err(e) => {
                eprintln!("Error: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    // --assert: run assertions against the app
    if let Some(assertions) = &cli.assert {
        let convex_data = parse_convex_data(&cli);
        match novoid_browser::browse_and_assert_with_convex(&cli.file, assertions, &convex_data) {
            Ok(results) => {
                let mut all_pass = true;
                for r in &results {
                    if r.pass {
                        eprintln!("\x1b[32m✓\x1b[0m {}", r.expr);
                    } else {
                        eprintln!("\x1b[31m✗\x1b[0m {} → {}", r.expr, r.detail);
                        all_pass = false;
                    }
                }
                if all_pass {
                    eprintln!("\n\x1b[32m{}/{} assertions passed\x1b[0m", results.len(), results.len());
                    std::process::exit(0);
                } else {
                    let failed = results.iter().filter(|r| !r.pass).count();
                    eprintln!("\n\x1b[31m{}/{} assertions failed\x1b[0m", failed, results.len());
                    std::process::exit(1);
                }
            }
            Err(e) => {
                eprintln!("Error: {e}");
                std::process::exit(1);
            }
        }
    }

    let convex_data = parse_convex_data(&cli);
    match novoid_browser::browse_with_convex(&cli.file, &convex_data) {
        Ok(schema) => {
            if let Some(path) = &cli.observe {
                if let Some(val) = schema.state.pointer(&format!("/{}", path.replace('.', "/"))) {
                    println!("{}", serde_json::to_string_pretty(val).unwrap());
                } else {
                    eprintln!("State path '{}' not found", path);
                    eprintln!("Available: {}", serde_json::to_string_pretty(&schema.state).unwrap());
                    std::process::exit(1);
                }
            } else {
                output(&cli, &schema);
            }
        }
        Err(e) => {
            eprintln!("Error: {e}");
            std::process::exit(1);
        }
    }
}

fn output(cli: &Cli, schema: &novoid_browser::synthesizer::BrowseSchema) {
    if cli.peek {
        novoid_browser::transport::output_peek(schema);
    } else if cli.compact {
        novoid_browser::transport::output_json_compact(schema);
    } else {
        novoid_browser::transport::output_json(schema);
    }
}
