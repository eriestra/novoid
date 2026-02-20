use crate::executor::StepResult;
use crate::extractor;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
pub enum OutputMode {
    Pretty,
    Compact,
    Peek,
}

/// Output results in the chosen format.
pub fn output(url: &str, results: &[StepResult], duration: Duration, mode: OutputMode) {
    match mode {
        OutputMode::Peek => output_peek(url, results, duration),
        OutputMode::Compact => output_json_compact(url, results, duration),
        OutputMode::Pretty => output_json(url, results, duration),
    }
}

fn build_output(url: &str, results: &[StepResult], duration: Duration) -> serde_json::Value {
    serde_json::json!({
        "url": url,
        "durationMs": duration.as_millis() as u64,
        "steps": results,
        "ok": results.iter().all(|r| r.ok),
    })
}

fn output_json(url: &str, results: &[StepResult], duration: Duration) {
    let val = build_output(url, results, duration);
    println!("{}", serde_json::to_string_pretty(&val).unwrap());
}

fn output_json_compact(url: &str, results: &[StepResult], duration: Duration) {
    let val = build_output(url, results, duration);
    println!("{}", serde_json::to_string(&val).unwrap());
}

fn output_peek(url: &str, results: &[StepResult], duration: Duration) {
    let width = 60;
    let cyan = "\x1b[36m";
    let red = "\x1b[31m";
    let green = "\x1b[32m";
    let reset = "\x1b[0m";

    let header = format!(" novoid-cdp ");
    let pad = width - 4 - header.len();
    println!("{cyan}┌─{header}{}{reset}", "─".repeat(pad.max(0)).to_string() + "┐");

    println!("{cyan}│{reset} url:    {:<width$}{cyan}│{reset}", truncate(url, width - 12), width = width - 4);
    println!("{cyan}│{reset} load:   {:<width$}{cyan}│{reset}", format!("{}ms", duration.as_millis()), width = width - 12);

    // Find snap result for rich output
    let snap = results.iter().find(|r| r.command == "snap");
    if let Some(snap_result) = snap {
        if let Some(ref val) = snap_result.value {
            if let Some(snapshot) = extractor::parse_snapshot(url, val) {
                println!("{cyan}│{reset} title:  {:<width$}{cyan}│{reset}", truncate(&snapshot.title, width - 12), width = width - 12);
                println!("{cyan}│{reset}{:width$}{cyan}│{reset}", "", width = width - 2);

                // Text preview (first 2 lines)
                let text_lines: Vec<&str> = snapshot.text.lines().take(3).collect();
                if !text_lines.is_empty() {
                    println!("{cyan}│{reset} text:   {:<width$}{cyan}│{reset}", truncate(text_lines[0], width - 12), width = width - 12);
                    for line in &text_lines[1..] {
                        println!("{cyan}│{reset}         {:<width$}{cyan}│{reset}", truncate(line, width - 12), width = width - 12);
                    }
                }

                println!("{cyan}│{reset}{:width$}{cyan}│{reset}", "", width = width - 2);
                println!(
                    "{cyan}│{reset} links:  {:<4} inputs: {:<4} tables: {:<4}        {cyan}│{reset}",
                    snapshot.links.len(),
                    snapshot.inputs.len(),
                    snapshot.tables
                );
            }
        }
    }

    // Show errors
    for r in results {
        if !r.ok {
            if let Some(ref err) = r.error {
                println!("{cyan}│{reset} {red}✗ {}: {}{reset}{:>width$}{cyan}│{reset}",
                    r.command, truncate(err, width - r.command.len() - 8), "", width = 0);
            }
        }
    }

    // Show eval/extract results
    for r in results {
        if r.ok && r.command != "snap" && r.command != "navigate" && r.command != "screenshot" {
            if let Some(ref val) = r.value {
                let s = serde_json::to_string(val).unwrap_or_default();
                println!("{cyan}│{reset} {green}✓{reset} {}: {:<width$}{cyan}│{reset}",
                    r.command, truncate(&s, width - r.command.len() - 8), width = width - r.command.len() - 8);
            }
        }
    }

    let all_ok = results.iter().all(|r| r.ok);
    let status = if all_ok { format!("{green}✓ ok{reset}") } else { format!("{red}✗ failed{reset}") };
    println!("{cyan}├{}{reset}", "─".repeat(width - 2).to_string() + "┤");
    println!("{cyan}│{reset} {status}{:>width$}{cyan}│{reset}", "", width = width - 9);
    println!("{cyan}└{}{reset}", "─".repeat(width - 2).to_string() + "┘");
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
