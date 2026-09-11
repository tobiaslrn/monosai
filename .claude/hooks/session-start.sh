#!/bin/bash
# Makes a Claude Code cloud session able to run the repository's own commands.
#
# The session VM is not this project's environment: its Node predates the one
# `.nvmrc` pins, the fresh clone has no `node_modules`, and its Playwright
# browser is a different build from the pinned one while the download CDN is
# off the network allowlist. A local checkout already has all three, so this
# only runs in the cloud.
#
# It is a fallback, not the fast path. Doing the same work in the environment's
# setup script (see `.claude/setup-script.sh`) puts it in the cached filesystem
# snapshot, and every step here then finds its work already done.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = 'true' ] || exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REQUIRED_NODE="$(tr -d 'v[:space:]' <"$REPO/.nvmrc")"
SANDBOX_CHROMIUM='/opt/pw-browsers/chromium'

log() { printf 'session-start: %s\n' "$1"; }

persist() {
  [ -n "${CLAUDE_ENV_FILE:-}" ] || return 0
  printf '%s\n' "$1" >>"$CLAUDE_ENV_FILE"
}

use_required_node() {
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    log "nvm is unavailable, staying on $(node --version)"
    return 0
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" --no-use

  if ! nvm which "$REQUIRED_NODE" >/dev/null 2>&1; then
    log "installing Node $REQUIRED_NODE"
    nvm install "$REQUIRED_NODE" --no-progress >/dev/null
  fi

  local bin
  bin="$(dirname "$(nvm which "$REQUIRED_NODE")")"
  export PATH="$bin:$PATH"
  persist "export PATH=\"$bin:\$PATH\""
  log "using Node $(node --version)"
}

install_dependencies() {
  if [ -d "$REPO/web/node_modules" ]; then
    return 0
  fi
  log 'installing web dependencies'
  npm --prefix "$REPO/web" install --no-audit --no-fund >/dev/null
}

# Playwright refuses to launch a build other than the one it pins, and the
# sandbox cannot download that build, so point it at the browser the sandbox
# does provide. Skipped the moment the pinned build is actually present.
select_chromium() {
  local playwright="$REPO/web/node_modules/.bin/playwright" expected
  [ -x "$playwright" ] && [ -x "$SANDBOX_CHROMIUM" ] || return 0

  expected="$("$playwright" install chromium --dry-run 2>/dev/null |
    awk '/Install location:/ { print $3; exit }')"
  if [ -n "$expected" ] && [ ! -e "$expected" ]; then
    persist "export MONOSAI_CHROMIUM_EXECUTABLE=\"$SANDBOX_CHROMIUM\""
    log "Playwright will use the sandbox Chromium, not $(basename "$expected")"
  fi
}

use_required_node
install_dependencies
select_chromium
