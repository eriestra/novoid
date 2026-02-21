#!/bin/sh
# fragment.sh — read/write/list named #region fragments in a file
#
# Usage:
#   sh fragment.sh <file> <region>           — read region to stdout
#   sh fragment.sh <file> <region> <infile>  — replace region content from infile
#   sh fragment.sh <file> --list             — list all regions with line numbers

set -e

FILE="$1"
REGION="$2"
INFILE="$3"

if [ -z "$FILE" ] || [ -z "$REGION" ]; then
  echo "Usage: sh fragment.sh <file> <region> [infile]" >&2
  echo "       sh fragment.sh <file> --list" >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

# Extract region name from a line containing #region
# Works with both <!-- #region name --> and // #region name
extract_name() {
  echo "$1" | sed -n 's/.*#region  *\([a-zA-Z0-9_:.=-]*\).*/\1/p'
}

# --list mode
if [ "$REGION" = "--list" ]; then
  n=0
  while IFS= read -r line; do
    n=$((n + 1))
    case "$line" in
      *"#region "*)
        case "$line" in
          *"#endregion"*) ;;  # skip endregion lines
          *)
            name=$(extract_name "$line")
            if [ -n "$name" ]; then
              printf "%6d  %s\n" "$n" "$name"
            fi
            ;;
        esac
        ;;
    esac
  done < "$FILE"
  exit 0
fi

# Find start line
START=""
n=0
while IFS= read -r line; do
  n=$((n + 1))
  case "$line" in
    *"#region "*)
      case "$line" in
        *"#endregion"*) ;;
        *)
          name=$(extract_name "$line")
          if [ "$name" = "$REGION" ]; then
            START=$n
            break
          fi
          ;;
      esac
      ;;
  esac
done < "$FILE"

if [ -z "$START" ]; then
  echo "Error: region '$REGION' not found in $FILE" >&2
  exit 1
fi

# Find end line
END=""
n=0
while IFS= read -r line; do
  n=$((n + 1))
  [ "$n" -le "$START" ] && continue
  case "$line" in
    *"#endregion"*)
      name=$(echo "$line" | sed -n 's/.*#endregion  *\([a-zA-Z0-9_:.=-]*\).*/\1/p')
      if [ "$name" = "$REGION" ] || [ -z "$name" ]; then
        END=$n
        break
      fi
      ;;
  esac
done < "$FILE"

if [ -z "$END" ]; then
  echo "Error: no #endregion found for '$REGION'" >&2
  exit 1
fi

# Read mode
if [ -z "$INFILE" ]; then
  awk -v s="$START" -v e="$END" 'NR > s && NR < e' "$FILE"
  exit 0
fi

# Write mode
if [ ! -f "$INFILE" ]; then
  echo "Error: input file not found: $INFILE" >&2
  exit 1
fi

# Build new file: head + new content + tail
{
  awk -v s="$START" 'NR <= s' "$FILE"
  cat "$INFILE"
  awk -v e="$END" 'NR >= e' "$FILE"
} > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
