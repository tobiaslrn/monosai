# Repository agent guide

## Test commands

- `npm test` runs the complete Vitest unit, component, adapter, worker, and
  fake-IndexedDB integration suite.
- `npm run test:coverage` runs that suite with the enforced coverage gate:
  85% statements, lines, and functions, and 75% branches.
- `npm run e2e` is the fast Playwright feedback lane. It runs tests tagged
  `@smoke` on desktop plus tests carrying both `@smoke` and `@mobile` on the
  Android project. Use this command for ordinary agent work and pull requests.
- `npm run e2e:full` runs every desktop browser regression and every `@mobile`
  Android regression. Run it when changing shared E2E infrastructure or before
  merging broad user-flow changes; CI runs it on pushes to `main`.
- `npm run e2e:pwa` runs the separate production-build service-worker,
  installability, base-path, and offline suite.

## Test-layer policy

- Prefer pure Vitest tests for domain logic and state transitions.
- Use Angular TestBed for component rendering, semantics, focus, and individual
  interaction behavior.
- Use fake IndexedDB with real Dexie transactions for repository integration.
- Reserve Playwright smoke coverage for critical cross-layer journeys. Narrow
  visual or control-level regressions may remain in the full Playwright lane,
  but should not be tagged `@smoke` when a lower layer covers the risk.
- Keep the PWA suite separate: the ordinary E2E build deliberately disables
  the service worker.

## Playwright structure

- Every test receives a fresh browser context. Do not share a mutable page or
  context through `beforeAll` to save time.
- `e2e/prerequisites.setup.ts` creates tested text-model, TTS, and generation
  prerequisite states through the real UI. It saves IndexedDB into ignored
  files under `playwright/.auth/`; never commit or hand-edit those files.
- Playwright storage state does not serialize Cache Storage or live WASM
  workers. Generation helpers must still activate the verified language
  runtime before capturing a grammar profile.
- Provider traffic must use the explicit OpenRouter and Anki route stubs. The
  ordinary suite must never require a live external service.
- Prefer role, label, and other semantic locators. Use test IDs for stable
  application actions and CSS selectors only when layout or styling is the
  behavior under test.
- Prefer observable state, locator assertions, request gates, fake clocks, or
  animation/render-frame synchronization over fixed sleeps. Deliberate waits
  are acceptable only for behavior defined by elapsed time, such as a long
  press or controlled delayed-provider response.
- Add `@mobile` only when touch behavior, the mobile user agent, or the narrow
  viewport materially changes the scenario. Add `@smoke` only to a critical
  journey that should block pull requests.

## CI behavior

- Pull requests run coverage, the `@smoke` browser lane, and the PWA suite.
- Pushes to `main` run coverage, the complete browser regression lane, and the
  PWA suite.
- The quality job builds and uploads the Pages artifact. The PWA job downloads
  and serves that exact artifact using `MONOSAI_PWA_PREBUILT=true`; it must not
  rebuild or reuse an arbitrary server already listening on the configured
  port.
