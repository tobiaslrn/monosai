# Monosai agent guide

## Before changing things

- Structure, layers, persistence, or external boundaries: read [docs/arc42](docs/arc42/)
  and [docs/decisions](docs/decisions/) first.
- Anything visual or interactive: follow [the design system](docs/design/design-system.md).
- Update the affected document in the same commit as the change.

## Data

- Committed Dexie schema versions are immutable. Schema changes add a new version, with a
  transactional upgrade when records change shape or meaning.
- Never silently reset or lose local data; migration failures offer explicit recovery.
- Anki access is read-only.
- Validate external, stored, imported, and AI-generated data at runtime.

## Verifying

- Run the affected specs while iterating and `npm test` before committing. Browser-visible
  changes also need `npm run e2e`.
- Judge visual changes only from screenshots you have opened, in light and dark, at desktop
  and Android size: `npm run build:pages`, a throwaway `@smoke @mobile` spec in `web/e2e`
  that saves to `test-results/`, then
  `MONOSAI_PREBUILT_DIST=true npx playwright test --grep @<tag>` from `web`. Delete the
  spec before committing.
- Playwright: navigate relatively (`page.goto('./#/library')`), stub OpenRouter and Anki,
  never use fixed sleeps.

## CI

- One application build per run; everything downstream uses `MONOSAI_PREBUILT_DIST=true`.
- `gate` is the single required check. `npm run verify` mirrors CI's blocking gates; change
  both together.
- Web app and Android bridge share only `protocol/contract.txt`. Read
  `android-bridge/README.md` before changing either side of it.

## Git

- Commits: `<type>(<scope>): <imperative summary>` — types `feat`, `fix`, `refactor`,
  `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`; scope always required (`repo`
  for cross-cutting); lowercase, no period, ≤ 72 characters.
- Before starting work, run `git fetch` and bring the current branch up to date. New branches
  start from the freshly updated `main`, the development branch here (there is no `develop`).
- Stay on the current branch. Never rewrite history. Push only when asked.
- After a push, watch CI and fix failures until `gate` is green.
