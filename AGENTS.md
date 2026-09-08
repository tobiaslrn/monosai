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
- Use Playwright for uploads, offline behavior, IndexedDB, and durable coverage.

### Looking at the UI

Never judge a visual change from the markup, the stylesheet, or a DOM query.
Render it, save a PNG, and open that PNG with the image-reading tool — reading
the file is the step, and a change is unverified until you have actually looked
at the picture on both a desktop and an Android-sized viewport, in light and
dark. Screenshot the state that is hard, not the empty one: the longest label,
the row that carries two controls at once, the partial and failed states.

The loop, once per change:

1. `npm run build:pages` once.
2. Write a throwaway spec under `web/e2e` that drives the app to the state you
   want and calls `page.screenshot({ path: 'test-results/<name>.png' })`. Tag its
   title `@smoke` — the default config greps for it — and add `@mobile` so the
   `android-chrome` project runs it too. Reuse the `e2e` helpers for setup, and
   loop over `page.emulateMedia({ colorScheme })` for both themes.
3. `MONOSAI_PREBUILT_DIST=true npx playwright test --grep @<your-tag>` from
   `web`, which reuses the build instead of making another.
4. Read every PNG it wrote. Fix what you see, rebuild, repeat.
5. Delete the throwaway spec before committing.

Commands:

- `npm test` — complete Vitest suite
- `npm run test:coverage` — suite with 85% statements/lines/functions and 75%
  branches
- `npm run e2e` — desktop and Android smoke lane; default for ordinary work
- `npm run e2e:full` — full browser regression; use for shared E2E changes
- `npm run e2e:pwa` — production-build PWA and offline suite

Keep the local feedback loop staged:

- During implementation, run only the directly affected test files, for example
  `npm test -- --include src/app/example/example.spec.ts`.
- After the focused tests pass, run `npm test` once before committing a code
  change. Do not repeatedly run the complete suite while iterating.
- Do not run `npm run test:coverage` locally by default. CI owns the coverage
  thresholds and reports. Run coverage locally only when changing its
  thresholds, exclusions, reporters, or CI integration, or when CI is unavailable.
- Run smoke E2E checks for browser-visible or cross-layer behavior, narrowing
  them with `--grep` while iterating when possible. Reserve `e2e:full` for shared
  E2E infrastructure or broad browser behavior, and `e2e:pwa` for PWA changes.
- Reserve `npm run verify` for CI/build-pipeline changes and unusually broad or
  high-risk work; it is not the default inner-loop command.

Before finishing, run checks proportional to the risk, including lint, type
checks, the production build when relevant, and the smoke E2E lane when the
change affects browser-visible or cross-layer behavior. `npm run verify` runs
exactly CI's blocking gates; when you add a gate to one, add it to the other.

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

A push is not finished until CI is green. Having pushed, watch the run
(`gh run watch` or `gh run list --branch main`), read the failing job's log,
fix the cause on the same branch, push again, and keep going until `gate`
passes. A red run you walked away from is an unfinished task, not a known
issue — say so explicitly if you genuinely cannot fix it.

Use editing tools for multiline file content rather than shell string literals.
