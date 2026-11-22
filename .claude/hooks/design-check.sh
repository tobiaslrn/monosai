#!/bin/bash
# Stop hook: before a turn ends, run the design checks over the files under
# web/src that this branch changed (since its merge base with origin/main, plus
# uncommitted and untracked files). A failure exits 2 with the messages on
# stderr, so Claude fixes them before stopping. It is a fast early warning;
# `npm test` and CI's `gate` remain the real gate.
set -uo pipefail

input="$(cat)"

field() {
  printf '%s' "$input" | node -e '
    let text = "";
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(text)[process.argv[1]];
        process.stdout.write(value === undefined || value === null ? "" : String(value));
      } catch {}
    });
  ' "$1"
}

# A second stop after this hook blocked once: let it through, so it never loops.
[ "$(field stop_hook_active)" = 'true' ] && exit 0

cwd="$(field cwd)"
repo="$(git -C "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -d "$repo/web/node_modules" ] || exit 0

base="$(git -C "$repo" merge-base HEAD origin/main 2>/dev/null || git -C "$repo" rev-parse HEAD)"
mapfile -t changed < <(
  {
    git -C "$repo" diff --name-only --diff-filter=d "$base" -- web/src
    git -C "$repo" ls-files --others --exclude-standard -- web/src
  } | sort -u
)
[ "${#changed[@]}" -eq 0 ] && exit 0

if ! output="$(cd "$repo/web" && node scripts/design-check.mjs --changed "${changed[@]}" 2>&1)"; then
  printf '%s\n' "$output" >&2
  exit 2
fi
exit 0
