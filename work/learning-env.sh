#!/usr/bin/env bash
workspace=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export PATH="$workspace/work/runtime/node/bin:$workspace/work/runtime/pi/node_modules/.bin:$PATH"
export PI_CODING_AGENT_DIR="$workspace/work/pi-agent"
export PUPPETEER_CACHE_DIR="$workspace/work/runtime/browser"
cd "$workspace"
