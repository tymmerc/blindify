#!/bin/bash
set -e

echo "Exporting Next.js static files..."

# Clean old out directory
rm -rf out

# Create out directory
mkdir -p out

# Copy static files from .next/server/app
rsync -av --progress .next/server/app/ out/ \
  --exclude='*.js' \
  --exclude='*.json' \
  --exclude='*.nft' \
  --exclude='*.txt' \
  --exclude='*.rsc'

# Copy static assets
cp -r .next/static out/_next/static 2>/dev/null || true
cp -r public/* out/ 2>/dev/null || true

# Copy root HTML files
find .next/server/app -name "*.html" -exec sh -c 'cp "$1" "out/$(basename $1)"' _ {} \;

echo "Export complete! Files are in ./out"
