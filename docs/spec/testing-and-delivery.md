# Testing, quality, and delivery

## 1. Quality strategy

Testing follows risk, not component count. The highest-risk code is language classification, immutable persistence, Anki compatibility, AI state machines, cancellation, offline behavior, and credential handling. These require deterministic fixtures and contract tests in addition to UI tests.

No external live service is required for the ordinary CI suite. OpenRouter and local Anki are represented by controllable fake HTTP servers/ports. A separate manual compatibility checklist uses real services before release.

## 2. Required test layers

### Unit tests

Test pure domain functions and state transitions without Angular TestBed when possible:

- IDs, canonical serialization, hashes, cache keys, and profile/policy fingerprints.
- Japanese-aware segmentation and paragraph preservation.
- UTF-16 token offsets, reading conversion, POS mapping, and character preservation.
- Literal visible Anki-field extraction and exact deduplication.
- Phrase trie/longest matching, exact/normalized known forms, entities, structural baseline, and precedence.
- Imported versus generated classification semantics.
- Whole-level cumulative grammar selection and individual overrides.
- Story sentence-range checks, exception decision reconciliation, repair counters, and all generation state transitions.
- Asset-job reconciliation, cancellation, resume, failure, and completeness.
- Reading-summary calculation, progress fallback, and deletion plans.
- Typed error mapping and redaction.

### Component tests

- Form validation and preserved drafts.
- Keyboard/touch activation of chips, token buttons, sentence menus, dialogs, bottom sheets, and progress controls.
- Focus trapping/restoration and live-region messaging.
- Reader aid switches and global preference propagation.
- Library filters, date groups, compact reading rows, audio availability, the New reading chooser, and confirmation flows.
- Required error presentation and recovery actions.

Use real semantic DOM queries. Avoid tests coupled to private component methods or CSS class names.

### Repository/integration tests

Use a browser-compatible IndexedDB test environment and real Dexie transactions:

- Fresh database creation and every version-to-version migration.
- Atomic imported reading and generated story creation.
- Current vocabulary remains unchanged after cancel/failure.
- A confirmed refresh overwrites the current snapshot and leaves exactly one persisted snapshot row.
- Snapshot deduplication/provenance.
- Paginated library query without loading blobs.
- Dynamic imported validation versus frozen generated validation.
- Idempotent cache writes and summary updates.
- Asset-job reload/reconciliation.
- Cascade deletion and zero orphan rows.
- Clear-audio and full-reset boundaries.
- Simulated quota/blocked/transaction errors.

### Adapter contract tests

Run the same semantic contract against each `AnkiVocabularyProvider` fake/fixture:

- capability probe;
- discovery hierarchy;
- exact mapping resolution;
- reviewed-at-least-once eligibility;
- literal field extraction;
- batching and cancellation;
- malformed/partial response rejection;
- absence of write operations.

Run task-specific OpenRouter adapter tests for status handling, cancellation, timeouts, SSE/non-streaming decoding if used, structured schema validation, response-size limits, audio decoding, and redaction.

### Worker tests

- Protocol-version mismatch.
- Multiple concurrent request IDs and late responses.
- Cooperative cancellation.
- Chunked 50,000-character analysis.
- Initialization failure and asset hash mismatch.
- Worker termination/reinitialization.
- Package memory cleanup.

### End-to-end tests

Use Playwright's current stable Chrome channel and two projects:

- Windows-like desktop viewport with keyboard/mouse, which runs every scenario.
- Android mobile viewport/touch context with Android Chrome user-agent
  characteristics, which runs the scenarios tagged `@mobile`: touch gestures,
  docked sheets, narrow layouts, and one accessibility sweep per screen area.
  A scenario whose behavior does not depend on the viewport is covered once.

The suite runs against the optimized `e2e` build (`npm run build:e2e`, served
by `scripts/serve-dist.mjs` at the root path) rather than the development
server. Every test starts with an empty browser cache, so the unbundled
development output costs roughly 60MB across 76 requests per test where the
built output costs 1.4MB across 15. That build ships no service worker; the
worker, installability, and offline reload are covered by the separate
`e2e:pwa` suite against the real Pages build.

`npm run e2e` is the critical-journey lane used during ordinary development
and on pull requests. Tests in that lane carry `@smoke`. `npm run e2e:full`
runs every browser regression on `main`; both commands retain isolated browser
contexts and the desktop/mobile project split. Expensive tested-model and
vocabulary prerequisites are created once by the Playwright setup project and
restored, including IndexedDB, into a fresh context for each dependent test.

Core E2E scenarios:

1. Fresh install -> paste -> save -> inspect word, with no setup.
2. Pasted text validation, including empty and over-limit errors.
3. Grammar empty gate -> cumulative selection/custom rule -> return to preserved generation form.
4. Local Anki discovery/mapping/refresh -> confirm snapshot -> generation gate becomes ready.
5. Package fallback with valid and missing-review-evidence fixtures.
6. Strict generation success.
7. Policy exception success with distinct display.
8. Unknown -> repair success; unknown after repair two -> unsaved draft.
9. Cancellation at writing, repair, grammar, and translation stages -> no saved story.
10. Grammar unavailable and partial translation failure -> saved story with correct statuses/retry.
11. Imported sentence translation/grammar cache and stale profile behavior.
12. Whole-reading translation cancel/resume.
13. Audio preparation fail/cancel/resume/complete/play/stop, all through the reader's floating audio player.
14. Library filtering, card content, deletion cascade.
15. Offline reload and allowed/blocked operations.
16. Service-worker update prompt preserves unsaved input/active jobs.
17. Key replacement/removal and absence from DOM/logs/errors.
18. Storage quota failure and safe recovery.

## 3. Golden language corpus

Maintain small reviewable fixtures with expected segmentation/tokenization/validation:

- Kana-only, kanji with okurigana, polite/plain inflections, irregular verbs/adjectives.
- Reviewed dictionary form used in inflected surface form.
- Orthographic variant allowed by the selected dataset.
- Semantic synonym that must remain unknown.
- Literal multi-token Anki phrase and overlapping shorter entries.
- Particles/auxiliaries in structural baseline.
- Katakana candidate exception.
- Japanese names, Arabic/full-width numbers, dates, time, counters, punctuation.
- Quoted dialogue, nested brackets, ellipses, emoji, combining marks, surrogate pairs.
- Mixed Japanese/Latin text and malformed-looking but inert text.
- Furigana line-wrap and long-token samples.

Golden expectations are versioned by analyzer/validator version. A tokenizer upgrade requires explicit reviewed fixture changes, never blind snapshot regeneration.

## 4. Anki fixtures

Maintain synthetic, license-safe fixtures rather than personal collections:

- Desktop API response sets for multiple decks/note types/fields.
- Android-compatible subset lacking richer desktop actions.
- Reviewed and never-reviewed sibling cards for one note.
- Suspended/lapsed reviewed cards.
- Missing/stale note type and field.
- Empty, HTML-formatted, phrase, slash-separated, duplicate, and malicious field values.
- Supported `.apkg`/`.colpkg` variants with and without scheduling information.
- Unsupported schema/compression, missing collection, unsafe path, oversized/decompression-ratio cases.

Each fixture declares expected mappings, eligible expressions, rejection counts, duplicate counts, and provenance.

## 5. AI fixtures

Record hand-authored mock responses for:

- valid story at each sentence-range boundary;
- too few/many sentences;
- malformed JSON and successful/failed format recovery;
- missing/duplicate indexes;
- candidate exceptions approved/rejected/missing explanation;
- repaired story introducing a different unknown;
- grammar complete/unavailable/invalid offsets;
- full/partial/mismatched translations;
- authentication, model, rate limit, timeout, 5xx, and offline errors;
- valid MP3, wrong MIME, empty body, oversized body, and undecodable audio.

Tests assert maximum call counts so retry combinations cannot cause runaway requests.

## 6. Accessibility verification

### Automated on every PR

- Axe or equivalent against every stable route/state fixture.
- Semantic role/name assertions for navigation, forms, dialogs, chips, progress, players, tokens, and sentence actions.
- Contrast checks for design tokens in light/dark modes.

### Manual release checklist

- Complete primary workflows using keyboard only on Windows.
- Verify visible focus and focus return after all overlays.
- Navigate with a screen reader through reader text, ruby, markers, translations, and inspector.
- Confirm marker meanings without color.
- Test 200% Android text scaling and browser 400% zoom.
- Test 320 CSS-pixel width without page-level horizontal scrolling.
- Verify touch targets, tap word inspection, discoverable sentence actions, and long-press alternative.
- Enable reduced motion.
- Confirm no automatic audio or unexpected live-region noise.

Zero serious/critical automated accessibility findings are allowed. Known moderate findings require a documented owner and release-blocking decision; do not blanket-ignore rules.

## 7. Performance budgets

Set measured budgets during the foundation milestone and enforce them in CI where stable. At minimum:

- No main-thread long task caused by tokenizing/validating the 50,000-character fixture.
- Library first page reads no audio blobs and a bounded amount of child data.
- Reader mounts only the visible/nearby paragraph window for the long fixture.
- Language worker initialization and memory usage pass on a representative Android 12+ midrange device.
- Package worker releases its large buffers after termination.
- Static bundle and language-asset sizes are printed in CI and regressions require explicit review.

Do not set unrealistic absolute timing based only on developer hardware. Publish both a CI regression threshold and real-device baseline.

## 8. Coverage and static quality gates

- Overall application: >= 85% statements/lines/functions and >= 75% branches.
- Domain validation, generation state machines, cache-key logic, repository transactions, and provider error mapping: >= 95% statements/lines and >= 90% branches.
- Every discriminated-union variant has a test; use exhaustive `never` checks.
- TypeScript strict mode passes with no suppressed errors or unreviewed `@ts-ignore`.
- ESLint passes with boundaries/no-cycles, no floating promises, and accessibility template rules.
- Formatting check, production build, unit/component/integration tests, E2E smoke, and link/asset validation all pass.
- Dependency audit has no unresolved high/critical production vulnerabilities. Any accepted lower issue is documented with exposure analysis.

Coverage never replaces behavioral assertions; do not create trivial tests solely to reach a percentage.

## 9. CI pipeline

Required pull-request jobs:

1. Dependency install from lockfile.
2. License/attribution and dependency audit.
3. Format, lint, typecheck, architectural-boundary check.
4. Dataset schema/hash/attribution validation.
5. Unit/component/worker/adapter/integration tests with coverage.
6. Production build and bundle report.
7. Playwright desktop/mobile smoke and accessibility scan.
8. Static-link, manifest, service-worker, and GitHub Pages base-path check.

Main-branch deployment runs the same gates, uploads immutable build artifacts, deploys Pages, and performs a post-deploy smoke test at the repository base URL. Do not deploy from an untested local tree.

## 10. PWA and offline acceptance

- Manifest meets Chrome installability criteria and icons render at required sizes.
- Installed app starts at the correct GitHub Pages base path.
- First online visit caches app shell and language assets with verified versions.
- After network removal, reload works and all promised local routes/assets function.
- OpenRouter controls enter offline states without hanging; package import remains available.
- Cached audio plays and saved translations/grammar display offline.
- An update is downloaded without taking control mid-form/job; user activation performs a controlled reload.
- Old caches are removed only after the new active version is safe.

## 11. Manual external compatibility matrix

Before release, record version/date/results for:

- Current Windows Chrome + current desktop Anki + supported AnkiConnect.
- Current Android Chrome on Android 12 minimum and a current Android version + selected AnkiConnect-compatible bridge.
- Package exports from current supported Anki Desktop and AnkiDroid configurations.
- At least one compatible OpenRouter text model and one compatible TTS model/voice used solely as examples in release notes, not hard-coded defaults.

Provider incompatibility must produce the documented fallback/error, not require an emergency code edit.

## 12. Definition of done

V1 is done only when:

- every product use case and E2E scenario passes;
- quality/coverage/accessibility gates pass;
- real Windows and Android checklists pass;
- offline/install/update tests pass on deployed GitHub Pages;
- read-only Anki action allowlist is reviewed;
- dataset licenses/attributions and reproducible asset builds are committed;
- migrations are tested from every released schema (for first release, empty -> v1 plus production-shaped fixtures);
- no deliberate exclusion has leaked into the UI or domain model;
- README/setup/troubleshooting documentation matches the shipped product;
- a fresh agent can build, test, deploy, and diagnose the app from repository documentation.
