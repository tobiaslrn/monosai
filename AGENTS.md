# Monosai agent guide

Monosai is a local-first Japanese reading app for beginners. Read the relevant
documentation before changing behavior, and prefer small, maintainable changes
over speculative abstractions.

## Engineering

- Read [the architecture documentation](docs/arc42/) before changing structure,
  layers, ports, persistence, or an external boundary. It describes the system as
  it is; [the decision records](docs/decisions/) say why. Update the affected
  chapter in the same commit as the change.
- Use strict TypeScript and established Angular patterns.
- Keep domain logic independent of UI, storage, and external services; access
  those concerns through explicit interfaces.
- Keep components and files cohesive. Avoid god services, catch-all utilities,
  unnecessary dependencies, `any`, dead code, and unexplained TODOs.
- Validate external, stored, imported, and AI-generated data at runtime. Use
  typed errors and exhaustive state handling.
- Preserve accessibility, offline behavior, data integrity, and read-only Anki
  access. Handle loading, empty, error, cancellation, retry, and offline states.
- Update tests and documentation when behavior or architecture changes.

## Data

- Treat committed Dexie schema versions as immutable.
- Add a new monotonically increasing version for schema changes and a
  transactional upgrade when records change shape or meaning.
- Preserve local data. Migration failures must offer an explicit recovery path
  and must never silently reset the database.

## UI

- Read [the design system](docs/design-system.md) before changing anything
  visual or interactive, and follow it. It is the authority for structure,
  controls, colour, units, motion, voice, and state. It holds rules and intent;
  values live in `web/src/styles/_tokens.scss` and `web/src/styles/_controls.scss`. A
  change that departs from it changes that document first, in the same commit.
- Keep screens quiet, intentional, responsive, and task-focused. Hide genuinely
  useful technical detail behind a compact advanced disclosure.
- Reuse Monosai tokens and control classes. Keep actions near what they affect,
  labels user-oriented, styles narrowly scoped, and sensitive fields masked.
- Preserve native semantics, keyboard behavior, focus visibility, overlay
  dismissal/focus return, and adequate touch targets.
- Check light and dark themes at desktop and Android-sized viewports. Do not
  accept clipping, horizontal overflow, or awkward responsive layouts.

## Testing

- Prefer Vitest for domain logic, Angular TestBed for component behavior, and
  fake IndexedDB with real Dexie transactions for repository integration.
- Reserve Playwright smoke tests for critical cross-layer journeys. Add
  `@mobile` only when mobile behavior materially differs.
- Every Playwright test gets a fresh context. Use semantic locators and
  observable state instead of fixed sleeps. Stub OpenRouter and Anki traffic.
- Keep PWA tests separate. There is one application build: ordinary E2E runs
  block the service worker through Playwright, and the PWA suite runs that same
  artifact with the worker live.
- Navigate relatively (`page.goto('./#/library')`). The build bakes
  `<base href="/monosai/">`, so a leading slash escapes the base path.
- For UI work, inspect the rendered app on desktop and Android-sized viewports.
  Use Playwright for uploads, offline behavior, IndexedDB, and durable coverage.

Commands:

- `npm test` — complete Vitest suite
- `npm run test:coverage` — suite with 85% statements/lines/functions and 75%
  branches
- `npm run e2e` — desktop and Android smoke lane; default for ordinary work
- `npm run e2e:full` — full browser regression; use for shared E2E changes
- `npm run e2e:pwa` — production-build PWA and offline suite

Before finishing, run checks proportional to the risk, including lint, type
checks, and the production build when relevant. `npm run verify` runs exactly
CI's blocking gates; when you add a gate to one, add it to the other.

## Build and CI

- One application build per run. The `build` job produces the Pages artifact;
  the browser shards, the PWA job, and the deployment all consume that same
  artifact with `MONOSAI_PREBUILT_DIST=true`. Nothing else rebuilds.
- That rule concerns the Pages artifact. The Android bridge is a separate APK
  with an independent lifecycle. Its `bridge` gate uses Java 21 for Gradle tests,
  debug assembly, Android lint and the resolved runtime licence check. Local
  `npm run bridge:verify` runs those checks; `npm run verify` includes it.
  Signing secrets are used only by the separate `bridge-v*` release workflow.
- `static`, `unit`, and `build` start together. Add `needs` only for a real
  artifact dependency, never for ordering alone.
- The browser lane is sharded three ways; `e2e-report` merges the shard blob
  reports into one report that names the tests that retried.
- `gate` is the single required status check. Add a job to its `needs` when the
  job must block merging, so branch protection never needs editing.
- `deploy` downloads the artifact CI verified and never builds, so the deployed
  bytes are the tested bytes.
- CI runs coverage, smoke E2E, and PWA checks on pull requests; pushes to `main`
  use the full browser lane.

## Git history

Use one shared, predictable message style for human and agent work.

Regular commits use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

- Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`,
  `ci`, `chore`, and `revert`.
- A scope is required for every commit. Use a short domain scope such as
  `vocabulary`, `reader`, `anki`, `pwa`, or `persistence`; use `repo` for
  genuinely cross-cutting repository work. Never omit the parentheses.
- Write the summary in lowercase imperative form, without a trailing period,
  and keep the subject at 72 characters or fewer.
- Describe the user-visible or architectural outcome, not the files changed or
  the fact that an agent performed the work.
- Add a body only when the motivation, trade-off, migration, or verification is
  not obvious. Separate it with a blank line and wrap prose near 100 characters.
- Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.

Examples:

```text
feat(vocabulary): import Anki packages from Android sharing
fix(pwa): preserve shared packages during offline handoff
refactor(persistence): commit vocabulary inputs atomically
```

When a merge commit is required, use:

```text
merge(<scope>): <imperative integration summary>
```

Use the same scope and summary rules as regular commits. Name the capability
being integrated rather than the source branch, worktree, tool, or pull-request
number. Example: `merge(vocabulary): integrate Android Anki package sharing`.
Prefer a fast-forward or squash when the requested workflow permits it; do not
create an empty merge commit solely to record that branches met.

## Working method

1. Inspect the relevant code and specifications.
2. Make the smallest complete change that fits the architecture.
3. Add or update tests, including failure and boundary cases where relevant.
4. Verify proportionally to risk and refactor immediately if structure degrades.
5. Finish with a clean tree or clearly identify unrelated changes.

Use subagents only for simple, isolated repository research. Work on the current
branch; do not create or switch branches. Keep commits focused, never rewrite
history, and do not push unless explicitly requested.

Use editing tools for multiline file content rather than shell string literals.
