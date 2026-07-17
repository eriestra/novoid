#!/bin/sh
# no∅ build — modular builds via esbuild
set -e

SRC="src"
DIST="dist"

mkdir -p "$DIST"

# Symlinks so the test runner can resolve ../js/ and ../css/ from src/app/
ln -sf ../dist "$SRC/js" 2>/dev/null || true
ln -sf ../dist "$SRC/css" 2>/dev/null || true

# ─── Core + Plugins ─────────────────────────────────────
npx esbuild "$SRC/core.js" --minify --outfile="$DIST/core.min.js"
npx esbuild "$SRC/core.css" --minify --outfile="$DIST/core.min.css"
npx esbuild "$SRC/components.css" --minify --outfile="$DIST/components.min.css"

for plugin in router convex auth toast render; do
  if [ -f "$SRC/plugins/$plugin.js" ]; then
    npx esbuild "$SRC/plugins/$plugin.js" --minify --outfile="$DIST/$plugin.min.js"
  fi
done

# ─── Verify outputs ──────────────────────────────────────────
for required in core.min.js core.min.css components.min.css; do
  if [ ! -f "$DIST/$required" ]; then
    echo "Build failed: $DIST/$required not created"
    exit 1
  fi
done

# ─── Stats ──────────────────────────────────────────────────
echo ""
echo "no∅ build complete"
echo ""
printf "  core.min.js       %sB\n" "$(wc -c < "$DIST/core.min.js" | tr -d ' ')"
printf "  core.min.css      %sB\n" "$(wc -c < "$DIST/core.min.css" | tr -d ' ')"
printf "  components.min.css %sB\n" "$(wc -c < "$DIST/components.min.css" | tr -d ' ')"
for plugin in router convex auth toast render; do
  if [ -f "$DIST/$plugin.min.js" ]; then
    printf "  %s.min.js    %sB\n" "$plugin" "$(wc -c < "$DIST/$plugin.min.js" | tr -d ' ')"
  fi
done

# Minimal-tier skill embeds must match minimal/nv-core.js + nv-min.css (soft check)
if command -v node >/dev/null 2>&1 && [ -f minimal/sync-skill.mjs ]; then
  node minimal/sync-skill.mjs --check >/dev/null 2>&1 || \
    echo "  ⚠ skill embeds out of sync — run: node minimal/sync-skill.mjs"
fi
