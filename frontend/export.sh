#!/bin/bash
set -e

BASEPATH="/blindify"

echo "Exporting Next.js static files..."

# Clean old out directory
rm -rf out

# Create out directory
mkdir -p out

# Copy static files from .next/server/app
rsync -a .next/server/app/ out/ \
  --exclude='*.js' \
  --exclude='*.json' \
  --exclude='*.nft' \
  --exclude='*.txt' \
  --exclude='*.rsc'

# Copy static assets to proper structure
mkdir -p out/_next/static
cp -r .next/static/chunks out/_next/static/ 2>/dev/null || true
cp -r .next/static/css out/_next/static/ 2>/dev/null || true
cp -r .next/static/media out/_next/static/ 2>/dev/null || true

# Also copy to root _next for compatibility
cp -r .next/static/chunks out/_next/ 2>/dev/null || true
cp -r .next/static/css out/_next/ 2>/dev/null || true
cp -r .next/static/media out/_next/ 2>/dev/null || true

# Copy public files
cp -r public/* out/ 2>/dev/null || true

# Fix basePath in HTML files
echo "Fixing basePath in HTML files..."
find out -name "*.html" -type f | while read file; do
  sed -i "s|src=\"/_next|src=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|href=\"/_next|href=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|=\"/blindify/blindify|=\"/blindify|g" "$file"
done

echo "✓ Export complete! Files are in ./out with basePath applied"
