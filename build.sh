#!/bin/sh
# no∅ build — instant minification, zero dependencies
set -e

SRC="src"
DIST="dist"

mkdir -p "$DIST"

# CSS: strip comments, collapse whitespace, remove blank lines
sed \
  -e 's|/\*[^*]*\*\+\([^/][^*]*\*\+\)*/||g' \
  -e 's/^[[:space:]]*//' \
  -e 's/[[:space:]]*$//' \
  -e '/^$/d' \
  "$SRC/novoid.css" > "$DIST/novoid.min.css"

# JS: strip single-line comments (not URLs), remove blank lines, trim
sed \
  -e 's|^\([[:space:]]*\)//[^!].*$||' \
  -e '/^[[:space:]]*$/d' \
  -e 's/^[[:space:]]*//' \
  -e 's/[[:space:]]*$//' \
  "$SRC/novoid.js" > "$DIST/novoid.min.js"

# Stats
SRC_CSS=$(wc -c < "$SRC/novoid.css" | tr -d ' ')
SRC_JS=$(wc -c < "$SRC/novoid.js" | tr -d ' ')
DIST_CSS=$(wc -c < "$DIST/novoid.min.css" | tr -d ' ')
DIST_JS=$(wc -c < "$DIST/novoid.min.js" | tr -d ' ')
TOTAL_SRC=$((SRC_CSS + SRC_JS))
TOTAL_DIST=$((DIST_CSS + DIST_JS))
SAVED=$((TOTAL_SRC - TOTAL_DIST))

echo "no∅ build complete"
echo "  src/novoid.css   ${SRC_CSS}B → dist/novoid.min.css  ${DIST_CSS}B"
echo "  src/novoid.js    ${SRC_JS}B → dist/novoid.min.js   ${DIST_JS}B"
echo "  total: ${TOTAL_SRC}B → ${TOTAL_DIST}B  (saved ${SAVED}B)"
