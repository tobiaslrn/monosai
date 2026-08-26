# Monosai agent guide

Monosai is a local-first Japanese reading app for beginners. Read the relevant
specifications before changing behavior, and prefer small, maintainable changes
over speculative abstractions.

## Engineering

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
- Keep PWA tests separate; ordinary E2E runs disable the service worker.
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
checks, and the production build when relevant. CI runs coverage, smoke E2E, and
PWA checks on pull requests; pushes to `main` use the full browser lane.

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
