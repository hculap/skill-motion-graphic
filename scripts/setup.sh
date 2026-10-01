#!/usr/bin/env bash
# Idempotent runtime for the motion-graphic skill.
# Installs Playwright + headless Chromium into a shared cache so project folders
# never need their own node_modules. Safe to re-run; prints the runtime path.
# When the runtime already launches, nothing is written (works inside read-mostly sandboxes).
set -euo pipefail

RUNTIME="${MOTION_RUNTIME:-${XDG_CACHE_HOME:-$HOME/.cache}/motion-graphic}"
export PATH="$HOME/.local/bin:$PATH"

missing=0
for bin in node npm ffmpeg ffprobe; do
  command -v "$bin" >/dev/null || { echo "MISSING: $bin" >&2; missing=1; }
done
[ "$missing" = 0 ] || { echo "Install the missing tools (apt install nodejs npm ffmpeg) and re-run." >&2; exit 1; }
command -v uv >/dev/null || echo "note: uv not found; beats.py (measuring a supplied music track) will need it" >&2
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 18 ] || { echo "Node 18+ required (found $(node -v))" >&2; exit 1; }

# Chromium needs a writable temp dir for its profile. Some agent sandboxes have no /tmp.
if ! ( : > "${TMPDIR:-/tmp}/.motion-probe" ) 2>/dev/null; then
  export TMPDIR="$PWD/.motion-tmp"; mkdir -p "$TMPDIR"
fi
rm -f "${TMPDIR:-/tmp}/.motion-probe"

launch_check() {
  [ -d "$RUNTIME/node_modules/playwright" ] || return 1
  node --input-type=module -e "
import { createRequire } from 'node:module';
const { chromium } = createRequire('$RUNTIME/package.json')('playwright');
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<canvas id=c width=8 height=8></canvas>');
const ok = await p.evaluate(() => !!document.getElementById('c').getContext('2d'));
await b.close();
if (!ok) process.exit(1);
" 2>/dev/null
}

if ! launch_check; then
  mkdir -p "$RUNTIME"; cd "$RUNTIME"
  if [ ! -d node_modules/playwright ]; then
    [ -f package.json ] || printf '{ "name": "motion-graphic-runtime", "private": true, "type": "module" }\n' > package.json
    npm install --no-audit --no-fund --loglevel=error playwright >&2
  fi
  npx --no-install playwright install chromium >&2
  launch_check || {
    echo "Chromium failed to launch. On Debian/Ubuntu try: sudo npx --prefix $RUNTIME playwright install-deps chromium" >&2
    exit 1
  }
fi

echo "motion-graphic runtime ready: $RUNTIME (playwright $(node -p "require('$RUNTIME/node_modules/playwright/package.json').version"))"
