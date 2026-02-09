#!/usr/bin/env bash
set -euo pipefail

pnpm install
pnpm build

echo "Build complete. Push to main to trigger GitHub Pages deploy."
