# novoid-publishing

Codified knowledge for the no∅ publish pipeline. This file replaces reading publish.sh, verify.sh, url.sh, build.sh, and seed.sh.

# novoid-publishing

Codified knowledge for the no∅ publish pipeline.

## 1. Publishing an App
Publishing an app runs static analysis (Nous) and headless empirical testing (novoid-browser) before deploying.
```sh
# Load secret
PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)

# Verify, publish, and run End-to-End behavioral tests
sh publish.sh <slug> src/app/<slug>.html
```

## 2. Testing App Logic
To verify app logic headlessly (without publishing):
```sh
sh verify.sh src/app/<slug>.html
```

## 3. Writing Test Specs
Always generate `<slug>.test.json` alongside every `<slug>.html`. You can script actions against the app's state.

```json
{
  "seed": { "tasks:list": [{"id": "1", "text": "Buy milk"}] },
  "steps": [
    { "action": "read", "resource": "count", "assert": { "eq": 0 } },
    { "action": "call", "tool": "inc", "then": { "read": "count", "assert": { "eq": 1 } } }
  ]
}
```

## 4. Making Framework Edits
If you edit framework files (`src/core.js`, `core.css`), you must run the build and seed scripts.
```sh
sh build.sh                                    # Minify src/ to dist/
sh seed.sh "$CONVEX_URL" "$PUBLISH_SECRET"     # Upload assets
sh publish.sh <slug> src/app/<slug>.html       # Republish apps
```
