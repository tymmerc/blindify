#!/bin/bash
set -e

BASEPATH="/blindify"

echo "Fixing basePath in HTML files..."

# Find all HTML files in out/ and replace paths
find out -name "*.html" -type f | while read file; do
  sed -i "s|src=\"/_next|src=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|href=\"/_next|href=\"${BASEPATH}/_next|g" "$file"
  sed -i "s|=\"/blindify/blindify|=\"/blindify|g" "$file"  # Remove duplicate basepath
done

echo "✓ BasePath fixed in all HTML files"
