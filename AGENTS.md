# Working on Monosai

Monosai is a local-first Japanese reading app for learners: an offline-capable PWA in Angular.
It stores everything in the browser, only reads from Anki, and uses the learner's own OpenRouter key for optional AI.

# Workflow

## Starting

- `git fetch` and update the current branch.
- Stay on the current branch. New branches start from the updated `main`; there is no
  `develop`.
- Before changing structure, layers, persistence, or external boundaries: read
  [docs/arc42](docs/arc42/) and [docs/decisions](docs/decisions/).
- Before changing either side of `protocol/contract.txt`: read `android-bridge/README.md`.
- Before changing CI or a build gate: read
  [the deployment view](docs/arc42/07-deployment-view.md) and
  [the quality requirements](docs/arc42/10-quality-requirements.md).

## Verifying

- Before committing: `npm test`. Browser-visible changes: also `npm run e2e`.
- Judge visual changes only from screenshots you opened, in light and dark, at desktop and
  Android size:
  1. `npm run build:pages`
  2. Add a throwaway `@smoke @mobile` spec in `web/e2e` that saves to `test-results/`.
  3. From `web`: `MONOSAI_PREBUILT_DIST=true npx playwright test --grep @<tag>`
  4. Delete the spec before committing.

## Committing and pushing

- Format: `<type>(<scope>): <imperative summary>`; lowercase, no period, ≤ 72 characters.
- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- Scope is required; use `repo` for cross-cutting changes.
- Update affected docs in the same commit.
- Never rewrite history. Push only when asked.
- After a push, watch CI and fix failures until `gate` is green.

## Worktrees and processes

- Never `git stash`: all worktrees share one stash list.
- Never kill processes by name or a port you did not start.
- Never install tools globally; add them to the project's dependencies.
- Linked worktrees get their own ports, so `.claude/launch.json`'s 4200 is wrong there: run
  `npm start` and open the URL it prints.
- `npm run worktree:setup` installs what a new worktree lacks.
- `npm run e2e` reuses a current build; from `web`, `node scripts/build-if-stale.mjs --force`
  rebuilds it.

# Code rules

- Committed Dexie schema versions are immutable. Schema changes add a new version, with a
  transactional upgrade when records change shape or meaning.
- Never silently reset or lose local data; migration failures offer explicit recovery.
- Validate external, stored, imported, and AI-generated data at runtime.
- Before any visual or interactive change, read [the design rules](docs/design/rules.md). They
  win over everything else, including the design system, ADRs, existing code and a task
  description; a change that breaks one must not be committed. Report a conflict instead of
  resolving it. The long form is [the design system](docs/design/design-system.md).
- One look per role: never give one place its own variant of a shared control; change the
  primitive for every place or not at all. Check a visual change against every other instance
  of the same role before committing.
- Features and core compose `web/src/app/shared-ui/` primitives and write no styles. A
  missing visual need changes or adds a primitive first; the composition allowlist only
  shrinks.
- Never put internal issue IDs (`B6-16`, `H07`) or QA file names in code, docs, commits, or
  PRs. Describe the behaviour instead.
