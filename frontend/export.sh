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

# Copy static assets
cp -r .next/static out/_next/ 2>/dev/null || true
cp -r public/* out/ 2>/dev/null || true

# Fix basePath in HTML files
echo "Fixing basePath in HTML files..."
find out -name "*.html" -type f | while read file; do
  sed -i "s|src=\"/_next|src=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|href=\"/_next|href=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|=\"/blindify/blindify|=\"/blindify|g" "$file"
done

echo "✓ Export complete! Files are in ./out with basePath applied"
