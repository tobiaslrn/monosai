#!/bin/bash
# Setup script for the Claude Code cloud environment.
#
# This file is a reference copy. It does not run from the repository: paste its
# contents into the Setup script field of the environment at claude.ai/code, and
# re-paste it after changing it here.
#
# It runs as root before Claude Code launches, and only when the environment has
# no cached filesystem snapshot — the first session, after the script or the
# allowed hosts change, and about weekly when the cache expires. Every later
# session boots from the snapshot and skips it, so what it installs outside the
# repository is already on disk and costs nothing.
#
# Constraints: it must exit zero or the session fails to start, and it must stay
# under roughly five minutes for the snapshot to build. Hence `|| true` on every
# step that is an optimisation rather than a requirement.
#
# Allowed hosts this needs beyond the Trusted defaults:
#   cdn.playwright.dev   the pinned Playwright browser build
# Without it the browser install below fails harmlessly and the SessionStart
# hook falls back to the Chromium the sandbox already ships.

set -uo pipefail

REPO="$(pwd)"

# The image ships Node 20, 21 and 22; this repository requires 24. Installing it
# into /opt/nvm puts it in the snapshot, so later sessions find it ready.
if [ -r "$REPO/.nvmrc" ]; then
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" --no-use || true
  nvm install "$(tr -d 'v[:space:]' <"$REPO/.nvmrc")" --no-progress || true
  nvm alias default "$(tr -d 'v[:space:]' <"$REPO/.nvmrc")" || true
  nvm use default || true
fi

# Warms the npm cache, which the snapshot keeps even though the session's clone
# is fresh. The SessionStart hook installs against that warm cache in seconds.
npm --prefix "$REPO/web" install --no-audit --no-fund || true

# Needs cdn.playwright.dev on the allowlist. The browser lands in
# /opt/pw-browsers, outside the repository, so the snapshot keeps it.
npm --prefix "$REPO/web" exec -- playwright install --with-deps chromium || true

exit 0
