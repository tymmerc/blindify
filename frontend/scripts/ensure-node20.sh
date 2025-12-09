#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="v20.11.1"
NODE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.node"
NODE_BIN="$NODE_DIR/bin/node"

if [ -x "$NODE_BIN" ]; then
  current="$("$NODE_BIN" -v || true)"
  if [ "$current" = "$NODE_VERSION" ]; then
    exit 0
  fi
fi

mkdir -p "$NODE_DIR"
tarball="node-${NODE_VERSION}-linux-x64.tar.xz"
url="https://nodejs.org/dist/${NODE_VERSION}/${tarball}"
tmp="$(mktemp)"
echo "Fetching Node ${NODE_VERSION}..."
curl -fsSL "$url" -o "$tmp"
rm -rf "$NODE_DIR"/*
tar -xJf "$tmp" -C "$NODE_DIR" --strip-components=1
rm -f "$tmp"
echo "Installed Node ${NODE_VERSION} to $NODE_DIR"
