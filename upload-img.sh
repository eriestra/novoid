#!/bin/sh
# Usage: sh upload-img.sh <name> <filepath>
# Uploads an image to Convex file storage and registers it in the files table.
# Requires .env.local with PUBLISH_SECRET.

set -e

NAME="$1"
FILEPATH="$2"

if [ -z "$NAME" ] || [ -z "$FILEPATH" ]; then
  echo "Usage: sh upload-img.sh <name> <filepath>"
  exit 1
fi

if [ ! -f "$FILEPATH" ]; then
  echo "Error: file not found: $FILEPATH"
  exit 1
fi

PUBLISH_SECRET=$(grep '^PUBLISH_SECRET=' .env.local | cut -d= -f2)
if [ -z "$PUBLISH_SECRET" ]; then
  echo "Error: PUBLISH_SECRET not found in .env.local"
  exit 1
fi

# Detect content type from extension
case "$FILEPATH" in
  *.png)  CONTENT_TYPE="image/png" ;;
  *.jpg|*.jpeg) CONTENT_TYPE="image/jpeg" ;;
  *.gif)  CONTENT_TYPE="image/gif" ;;
  *.svg)  CONTENT_TYPE="image/svg+xml" ;;
  *.webp) CONTENT_TYPE="image/webp" ;;
  *)      CONTENT_TYPE="application/octet-stream" ;;
esac

echo "Uploading $FILEPATH as $NAME ($CONTENT_TYPE)..."

# Step 1: Get signed upload URL
UPLOAD_URL=$(npx convex run files:generateUploadUrl 2>/dev/null | tr -d '"')

# Step 2: Upload binary file, get storageId
RESPONSE=$(curl -s -X POST "$UPLOAD_URL" \
  -H "Content-Type: $CONTENT_TYPE" \
  --data-binary "@$FILEPATH")

STORAGE_ID=$(echo "$RESPONSE" | sed 's/.*"storageId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$STORAGE_ID" ] || [ "$STORAGE_ID" = "$RESPONSE" ]; then
  echo "Error: failed to parse storageId from upload response"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Uploaded to storage: $STORAGE_ID"

# Step 3: Register in files table
npx convex run files:save "{\"name\":\"$NAME\",\"storageId\":\"$STORAGE_ID\",\"contentType\":\"$CONTENT_TYPE\",\"secret\":\"$PUBLISH_SECRET\"}"

echo "Done! Image available at /img/$NAME"
