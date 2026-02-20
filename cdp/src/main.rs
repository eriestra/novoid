use clap::Parser;
use futures::StreamExt;
use std::process;

mod launcher;
mod session;
mod executor;
mod extractor;
mod transport;

use executor::Command;
use transport::OutputMode;

#[derive(Parser)]
#[command(name = "novoid-cdp", about = "CDP browser control for no∅")]
struct Cli {
    /// URL to navigate to
    url: Option<String>,

    /// Snapshot: title, text, links, inputs, structure
    #[arg(long)]
    snap: bool,

    /// Full-page screenshot to file
    #[arg(long)]
    screenshot: Option<String>,

    /// Click element (CSS selector)
    #[arg(long)]
    click: Option<String>,

    /// Type into element: --type <selector> <text>
    #[arg(long = "type", num_args = 2, value_names = ["SELECTOR", "TEXT"])]
    type_into: Option<Vec<String>>,

    /// Scroll element into view
    #[arg(long)]
    scroll: Option<String>,

    /// Wait until selector resolves
    #[arg(long)]
    wait: Option<String>,

    /// Wait for network idle
    #[arg(long)]
    wait_idle: bool,

    /// Evaluate JS expression
    #[arg(long)]
    eval: Option<String>,

    /// Extract mode: text | links | tables | inputs | novoid
    #[arg(long)]
    extract: Option<String>,

    /// Run a JSON command script
    #[arg(long)]
    script: Option<String>,

    /// Attach to existing Chrome on port
    #[arg(long)]
    port: Option<u16>,

    /// Headless mode
    #[arg(long)]
    headless: bool,

    /// Per-command timeout in ms
    #[arg(long, default_value = "15000")]
    timeout: u64,

    /// Human-readable colored output
    #[arg(long)]
    peek: bool,

    /// Compact JSON output
    #[arg(short)]
    c: bool,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let output_mode = if cli.peek {
        OutputMode::Peek
    } else if cli.c {
        OutputMode::Compact
    } else {
        OutputMode::Pretty
    };

    // Script mode: load commands from JSON file
    if let Some(ref script_path) = cli.script {
        match executor::load_script(script_path) {
            Ok((url, commands)) => {
                run_commands(url, commands, &cli, output_mode).await;
            }
            Err(e) => {
                eprintln!("Error loading script: {e}");
                process::exit(1);
            }
        }
        return;
    }

    // URL is required when not in script mode
    let url = match cli.url {
        Some(ref u) => u.clone(),
        None => {
            eprintln!("Error: URL is required (or use --script)");
            process::exit(1);
        }
    };

    // Build command sequence from CLI flags
    let mut commands: Vec<Command> = Vec::new();

    commands.push(Command::Navigate { url: url.clone() });

    if let Some(ref selector) = cli.click {
        commands.push(Command::Click { selector: selector.clone() });
    }

    if let Some(ref args) = cli.type_into {
        commands.push(Command::Type {
            selector: args[0].clone(),
            text: args[1].clone(),
        });
    }

    if let Some(ref selector) = cli.scroll {
        commands.push(Command::Scroll { selector: selector.clone() });
    }

    if let Some(ref selector) = cli.wait {
        commands.push(Command::Wait {
            selector: selector.clone(),
            timeout: cli.timeout,
        });
    }

    if cli.wait_idle {
        commands.push(Command::WaitIdle { timeout: cli.timeout });
    }

    if let Some(ref js) = cli.eval {
        commands.push(Command::Eval { js: js.clone() });
    }

    if let Some(ref mode) = cli.extract {
        commands.push(Command::Extract { mode: mode.clone() });
    }

    if cli.snap {
        commands.push(Command::Snap);
    }

    if let Some(ref path) = cli.screenshot {
        commands.push(Command::Screenshot { path: path.clone() });
    }

    run_commands(url, commands, &cli, output_mode).await;
}

async fn run_commands(url: String, commands: Vec<Command>, cli: &Cli, output_mode: OutputMode) {
    // Launch or attach browser
    let (browser, mut handler) = match launcher::connect(cli.headless, cli.port).await {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Error launching browser: {e}");
            process::exit(1);
        }
    };

    // Spawn the handler task
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    // Create a new page
    let page = match session::new_page(&browser).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error creating page: {e}");
            process::exit(1);
        }
    };

    // Execute commands
    let start = std::time::Instant::now();
    let results = match executor::execute(&page, commands, cli.timeout).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error: {e}");
            process::exit(1);
        }
    };
    let duration = start.elapsed();

    // Output results
    transport::output(&url, &results, duration, output_mode);

    // Clean up
    drop(page);
    drop(browser);
    let _ = handle.await;
}
