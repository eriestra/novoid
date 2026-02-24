# novoid-cdp

CDP (Chrome DevTools Protocol) browser automation for no∅. Drive a real Chrome/Chromium to browse, scrape, fill forms, screenshot, and interact with live pages.

## When to Use

| Tool | When |
|---|---|
| **Qed** (`browser/`) | Verify no∅ app logic before publish — headless QuickJS, no network |
| **CDP** (`cdp/`) | Interact with live web, external sites, published apps — real Chrome |

**Rule:** Qed for no∅ apps. CDP for the live web. Don't use CDP to verify app logic — that's Qed's job.

# novoid-cdp

CDP (Chrome DevTools Protocol) browser automation for no∅. Drive a real Chrome/Chromium to browse, scrape, fill forms, screenshot, and interact with live pages.

> **Rule:** Use `Qed` (`novoid-browser`) to verify no∅ app logic. Use `CDP` to interact with the live web and external sites.

## 1. Installation
Build the Rust crate once.
```sh
cd cdp && cargo build
```

## 2. Basic Usage (CLI)

**Snapshot a page (text, links, inputs):**
```sh
novoid-cdp https://example.com --snap --headless
```

**Take a screenshot:**
```sh
novoid-cdp https://example.com --screenshot /tmp/out.png --headless
```

**Extract specific data:**
```sh
novoid-cdp https://example.com --extract tables --headless
```
*(Modes: `text`, `links`, `tables`, `inputs`, `novoid`)*

## 3. Interaction & Scripts
You can script clicks and typing using a JSON file to represent the flow. 
```json
// scripts/login.json
{
  "url": "https://example.com/login",
  "steps": [
    { "type": "wait",       "selector": "#email" },
    { "type": "type",       "selector": "#email",    "text": "$ENV.CDP_EMAIL" },
    { "type": "type",       "selector": "#password", "text": "$ENV.CDP_PASSWORD" },
    { "type": "click",      "selector": "[type=submit]" },
    { "type": "waitIdle" },
    { "type": "extract",    "mode": "tables" }
  ]
}
```
Run it:
```sh
novoid-cdp --script scripts/login.json --headless
```
*(Note: `$ENV.KEY` reads from environment variables to avoid hardcoded credentials).*

## 4. Nex Integration
CDP is available as slash commands in Nex:
- `/browse <url>` (Snapshots and summarizes)
- `/screenshot <url>`
- `/scrape <url> [mode]`

## 5. Extracting no∅ State
When targeting a published no∅ app, `--extract novoid` evaluates `__novoid_observed?.getAll()`. This returns the exact same reactive state that `Qed` sees, but from a live browser.
