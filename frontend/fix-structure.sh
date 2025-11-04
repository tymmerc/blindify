#!/bin/bash

set -e

echo "Fix Blindify Next.js directory structure"

# Source and target
SRC="src/app/app"
DEST="src/app"

if [ ! -d "$SRC" ]; then
  echo "Nothing to fix. '$SRC' does not exist."
  exit 0
fi

echo "Moving pages from $SRC to $DEST..."

# Move all nested folders (auth, game, lobby, profile, etc.)
rsync -av --remove-source-files "$SRC/" "$DEST/"

echo "Removing empty directory $SRC..."
rm -rf "$SRC"

echo "Done."
