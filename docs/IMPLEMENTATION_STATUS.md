# Implementation status

Tracks progress against [docs/spec/implementation-roadmap.md](spec/implementation-roadmap.md).
Each milestone records what was built, how it was verified, assumptions taken,
and what remains.

| Milestone                                | State       |
| ---------------------------------------- | ----------- |
| 0 — Repository and decision scaffolding  | Complete    |
| 1 — Persistence foundation               | Complete    |
| 2 — Offline language assets and worker   | Complete    |
| 3 — Reader vertical slice                | Complete    |
| 4 — Grammar profile                      | Complete    |
| 5 — Anki vocabulary                      | Complete    |
| 6 — OpenRouter and settings              | Complete    |
| 7 — Generation and local validation      | Complete    |
| 8–10                                     | Not started |

## Milestone 0 — Repository and decision scaffolding

### Delivered

- Angular 21.2 application: standalone components, signals, zoneless change
  detection, strict TypeScript, SCSS, hash routing, and a `pages` build
  configuration using the `/monosai/` base href.
- Semantic design tokens (`src/styles/_tokens.scss`) with warm paper neutrals,
  sage primary, lavender accent, and full light/dark palettes. `System` theme
  follows `prefers-color-scheme`; an explicit choice pins `data-theme`.
- Responsive application shell: desktop sidebar (collapsing to icons with
  accessible names below 1120px), mobile bottom navigation with a full-height
  More sheet, skip link, and a focusable `main` landmark.
- Bootstrap state machine (`AppInitializerService`) with ordered DI-provided
  initialization steps, a fatal recovery screen with Retry, and a shared
  `mn-error-screen` that states what failed and whether data was saved.
- Domain primitives: branded IDs, `Result`, typed error base with copyable
  technical codes, injectable `Clock`, canonical JSON serialization, and the
  `Hasher` port with a synchronous SHA-256 implementation.
- Build/version diagnostics in Settings.
- Quality tooling: ESLint (strict type-checked rules, Angular template
  accessibility rules, layered import zones, no cycles), Prettier, `tsc -b`
  typecheck, Vitest unit tests, Playwright desktop + Android projects with an
  axe accessibility scan, GitHub Actions CI, and a Pages deployment workflow
  gated on CI success.
- Icons come from the bundled Lucide set (`lucide-angular`), mapped to semantic
  names in `src/app/shared-ui/icon/icon-set.ts`. No remote assets.

### Checkpoint evidence

- Production build deploys to a Pages-like subpath: `npm run build:pages` emits
  `/monosai/` asset URLs, and hash routing keeps deep links reloadable.
- Desktop sidebar and mobile navigation both render and an accessible route
  works, verified by component tests, Playwright at both viewports, and manual
  browser inspection.
- CI quality gates run on push and pull request.
- No feature imports infrastructure directly, enforced by
  `import/no-restricted-paths`.

## Milestone 1 — Persistence foundation

### Delivered

- Canonical domain model: readings (imported and generated), paragraphs,
  sentences, tokens and part-of-speech enum, token validation categories,
  reading progress, vocabulary snapshots/items/provenance, source mappings,
  grammar rules and profile captures, enrichment records, batch jobs, settings,
  credential status, storage errors, and persistence status.
- Domain ports for every repository, plus storage maintenance, with
  `Result`-returning methods and typed `StorageError` variants.
- Dexie schema v1 with a single versioned migration registry (`migrations.ts`),
  Zod row schemas, row-version envelopes, and a storage-error mapper that keeps
  raw Dexie errors inside infrastructure.
- Repository adapters: settings (per-concern rows), credentials, readings
  (atomic save, paragraph-window graph loading, paginated library queries,
  cascade deletion, progress, Continue reading), vocabulary (atomic snapshot
  commit and activation, batched item streaming, provenance), source mappings,
  grammar (selection, custom rules, profile captures), enrichment
  (cache-key-idempotent translations, grammar analyses, audio metadata plus
  bytes, completion summaries), and batch jobs (completion, failure,
  cancellation, reconciliation).
- Browser storage maintenance: persistence status and request, audio-cache
  clearing, and full reset of the database and Cache Storage.
- Application layer: `AppSettingsStore` (theme and reader aids, loaded at
  bootstrap) and `StorageStore`, both signal-based and repository-port only.
- Startup sequence now opens the database and loads settings before navigation
  renders; failures show the recovery screen with Retry.
- Settings gains persisted appearance, persisted global reader aids, storage
  status, audio-cache clearing, a two-step danger-zone reset, and the database
  schema version in diagnostics.

### Checkpoint evidence

| Requirement                                                | Evidence                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Atomic create/delete/progress/snapshot/cache/job operations | `dexie-reading.repository.spec.ts`, `dexie-vocabulary.repository.spec.ts`, `dexie-enrichment.repository.spec.ts`, `dexie-job.repository.spec.ts` |
| Quota and aborted transactions preserve prior state         | `persistence-integrity.spec.ts` — simulated `QuotaExceededError` and `AbortError` leave earlier data and the previous active snapshot intact |
| Saved key never reaches a component, DOM, log, or diagnostic | `dexie-credential.repository.spec.ts` (status never contains the key; only `useApiKey` exposes it) and the `never exposes a saved credential in the DOM` end-to-end test |
| Zero orphan rows after deletion                             | Cascade deletion test asserts every owned table is empty and Continue reading is repaired                        |
| Fresh database creation and schema integrity                | `persistence-integrity.spec.ts` — monotonic versions, every required table, and no index on text, tokens, bytes, or credentials |

### Verification

| Command                 | Result                                     |
| ----------------------- | ------------------------------------------ |
| `npm run format:check`  | Pass                                       |
| `npm run lint`          | Pass (0 problems)                          |
| `npm run typecheck`     | Pass                                       |
| `npm test`              | Pass — 19 files, 124 tests                 |
| `npm run build`         | Pass — 791.78 kB initial, 179.14 kB transfer |
| `npm run e2e`           | Pass — 22 tests (desktop-chrome, android-chrome) |
| `npm audit --omit=dev`  | 0 vulnerabilities                          |

### Assumptions and decisions

- [0004 — Persistence shape](decisions/0004-persistence-shape.md): row
  envelopes and validation scope, audio stored as bytes, selection by row
  presence, denormalized library summaries, credential isolation, and
  transaction boundaries.
- Migrations are declared in one ordered registry. Only version 1 exists, so the
  tested transition is empty → v1 with production-shaped fixtures; each future
  version adds an entry plus its own migration test.
- The initial bundle budget was raised to 850 kB (warning) / 1 MB (error) to
  accommodate Dexie, Zod, and the icon set. Transfer size is 179 kB.

### Remaining work in later milestones

- Language assets, worker, and the reader (Milestones 2–3).
- Grammar, Anki, OpenRouter, generation, enrichment, and audio (Milestones 4–9).
- PWA manifest, icons, install UX, and offline fallback (Milestone 10).

## Milestone 2 — Offline language assets and worker

### Delivered

#### Datasets and reproducible build

- `scripts/assets/` builds the whole language bundle. `npm run assets:build`
  downloads the pinned upstream source, verifies its digest, validates the
  reviewed datasets, and writes `public/assets/language/1/` deterministically:
  the same inputs always produce byte-identical files.
- `npm run assets:verify` re-checks the committed bundle with no network access
  and runs in CI as the dataset schema, digest, and attribution gate.
- `manifest.json` records every file's size and SHA-256 digest plus the licence,
  holder, URL, and redistribution notice for each of the four components.
- Tokenizer: `lindera-wasm-web-ipadic` 2.0.0 (Lindera, MIT, with IPADIC,
  BSD 3-clause). Not committed: it ships from the locked package and the Angular
  builder copies it to `assets/language/1/tokenizer/`.
- Dictionary: JMdict English common-only, pinned release
  `3.6.2+20260817122448`, compacted to 22,629 entries (3.46 MB, 0.90 MB gzipped)
  with bounded senses and glosses and JMdict codes mapped to the domain enum.
- Grammar catalog: 256 Monosai-authored rules. **Deleted in Milestone 4**; see
  [ADR 0014](decisions/0014-remove-grammar-rule-catalog.md). The bundle now ships
  six grammar difficulty presets in its place.
- Structural baseline: 177 Monosai-versioned sentence-building forms across
  particles, copula, auxiliaries, productive inflection, conjunctions, formal
  nouns, affixes, counters, and punctuation. Content words are rejected by the
  build, and forms claimed by more than one entry are recorded in the artifact.

#### Language domain

- `Tokenizer` and `Dictionary` ports, the `LanguageRuntime` and
  `LanguageAssetSource` ports, and a `LanguageError` union covering asset,
  transport, and analysis failures.
- Deterministic Japanese-aware sentence segmentation with versioned rules:
  bracket-aware, absorbing terminator runs, trailing closers and inline spaces,
  splitting dialogue on newlines, and tiling its input exactly.
- Kana normalization: katakana to hiragana, script tests, redundant-ruby
  suppression, and one NFKC-based lookup key used by every index.
- Snapshot matcher: exact canonical surfaces, normalized single-token forms, and
  a longest-match phrase trie over entries of two or more tokens.
- Entity recognizers for numbers, dates, times, names, and symbols.
- Classification with the specified precedence, and an explicit
  `vocabulary-not-configured` outcome instead of marking every word unknown.

#### Worker and client

- Versioned discriminated-union protocol with request ids, runtime-validated
  request and response envelopes, and serializable domain errors.
- `LanguageWorkerHost` owns initialization, dictionary lookup, snapshot
  compilation, classification, and analysis, yielding between chunks so a cancel
  message is delivered promptly. It is separated from the worker entry point so
  it can be tested without a `Worker`.
- IPADIC tags are mapped to the bounded part-of-speech enum, and UTF-8 byte
  offsets are converted to UTF-16 with per-token verification against the source
  slice.
- `LanguageWorkerClient` multiplexes concurrent requests, converts abort signals
  into cooperative cancel messages, and drops responses whose request is no
  longer pending.

#### Assets, caching, and activation

- Every asset is fetched cache-first, proven against its manifest digest, and
  only then used. A corrupted cache entry is dropped and re-downloaded once;
  only freshly downloaded bytes that still fail produce
  `asset-integrity-mismatch`.
- The manifest is cached alongside the files it describes, which is what makes
  initialization work with no network.
- `LanguageStore` activates a version into `LanguageAssetSettings` only after
  every asset verifies, then prunes superseded bundle caches. A failure leaves
  the previously recorded versions untouched.
- Preparation starts on its own after a successful startup and is never awaited,
  so navigation, the library, and settings render while the bundle downloads.
- Settings gains a Language assets section: state, active versions, a retry
  action shown only after a failure, and the redistribution notices for all four
  datasets.

### Checkpoint evidence

| Requirement                                              | Evidence                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Golden fixtures pass                                     | `golden-corpus.spec.ts` — 20 reviewed cases plus round-trip texts, versioned by analyzer and validator version   |
| Source characters and offsets preserved                  | Round-trip assertions per token, surrogate-pair and combining-mark fixtures, and exact tiling in segmentation   |
| Known inflection resolves through an explainable lemma   | `食べました` against a reviewed `食べる` classifies as `anki-normalized` with basis `lemma`                       |
| Semantic synonym stays unknown                           | `自動車` against a reviewed `車` stays unknown; a shared kanji is not accepted either                            |
| Reviewed phrase wins longest match                       | `国際交流基金` beats the shorter reviewed `国際`, with the full token span recorded                              |
| Protocol-version mismatch                                | `language-worker-host.spec.ts`                                                                                  |
| Concurrent request ids and late responses                | `language-worker-host.spec.ts` and `language-worker.client.spec.ts`                                             |
| Cooperative cancellation                                 | Cancelled analysis answers `cancelled`, emits exactly one response, and the client ignores the late answer      |
| Chunked 50,000-character analysis                        | `language-worker-performance.spec.ts` — full round trip, chunk count, and per-chunk bound                       |
| Initialization failure and asset hash mismatch           | Tokenizer failure, download failure, tampered bytes, and a wrong manifest digest each produce their typed error |
| Offline initialization                                   | `e2e/language-assets.spec.ts` — every bundle request aborted, initialization still succeeds from Cache Storage  |
| Integrity failure recovers rather than crashing          | End-to-end corrupted asset shows `language/asset-integrity-mismatch`, activates nothing, and retries cleanly    |
| Navigation never waits for the bundle                    | End-to-end test holds the tokenizer download open and asserts the shell renders, navigates, and accepts input   |

### Measured performance baseline

Windows 11, Node 24.4.1, on the development machine. Real Android 12 midrange
figures are recorded in Milestone 10 against the deployed build.

| Measurement                                       | Value                             |
| ------------------------------------------------- | ----------------------------------- |
| Tokenizer runtime size                            | 13,067,153 bytes                    |
| WebAssembly instantiation                         | 6.5 ms                              |
| Tokenizer construction                            | 136 ms                              |
| Dictionary artifact parse (22,629 entries)        | 36 ms                               |
| Analysis of the 50,000-character fixture          | 380 ms total, 37,499 tokens         |
| Chunks the analysis is split into                 | 24 (2,000 characters per chunk)     |
| Slowest chunk between yields                      | 34.8 ms                             |
| Median chunk between yields                       | 14.5 ms                             |

No chunk reaches the 50 ms long-task threshold, and all of this work happens in
the language worker, so the main thread performs no analysis at all. The
per-chunk bound is asserted in CI; absolute timings are recorded here rather
than asserted, because they are developer-hardware figures.

### Verification

| Command                 | Result                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run format:check`  | Pass                                                                |
| `npm run lint`          | Pass (0 problems)                                                   |
| `npm run typecheck`     | Pass                                                                |
| `npm run assets:verify` | Pass — 22,629 dictionary entries, 256 rules, 177 baseline entries   |
| `npm test`              | Pass — 29 files, 272 tests                                          |
| `npm run build`         | Pass — 802.73 kB initial, 182.08 kB transfer; the language worker is a 362.38 kB lazy chunk (63.92 kB transfer) |
| `npm run e2e`           | Pass — 32 tests (desktop-chrome, android-chrome)                    |
| `npm audit --omit=dev`  | 0 vulnerabilities                                                   |

### Assumptions and decisions

- [0005 — Tokenizer selection](decisions/0005-tokenizer-selection.md)
- [0006 — Bundled dictionary dataset](decisions/0006-dictionary-dataset.md)
- [0007 — Grammar catalog and structural baseline](decisions/0007-grammar-catalog-and-structural-baseline.md)
- Language assets are prepared automatically once startup succeeds, but never as
  a startup step. Every reading path needs the tokenizer, so asking the user to
  request it would be friction with no benefit; the specification's requirement
  is that basic navigation must not *wait* for the worker, which a background
  preparation that is never awaited satisfies. Settings reports progress and
  offers a retry only when preparation failed.
- The application owns the language cache (`monosai-language-<version>`) rather
  than delegating it to the service worker, so integrity verification and
  version activation stay application-controlled and work in development, where
  no service worker runs. The service-worker asset groups do not match the
  bundle, so nothing is cached twice.
- The manifest is read cache-first without a digest of its own, because it is
  the root of trust and its URL is immutable per bundle version.
- `src/testing/**` is excluded from the application TypeScript project: the
  language test helpers read the committed bundle from disk, which the browser
  build must never compile.
- Structural baseline scope excludes demonstratives and pronouns; they are
  ordinary vocabulary a learner is expected to have reviewed. This is recorded
  in decision 0007 and asserted by the golden corpus.

### Remaining work in this area

- The reader UI that consumes analysis, furigana, and markers is Milestone 3.
- Snapshot compilation is exercised by tests only until Milestone 5 supplies
  real Anki snapshots.
- Real-device Android performance and the service-worker offline fallback are
  Milestone 10.
- A full manual language review of the 177 baseline entries is a release gate,
  not a milestone gate. The equivalent 256-rule catalog review was removed with
  the catalog in Milestone 4.

## Milestone 3 — Reader vertical slice

### Delivered

- **Language protocol version 2**: a new `analyze-sentences` batch operation
  tokenizes already-decided sentence texts without re-segmenting them, so a
  learner's split/merge corrections in import review survive into the saved
  reading. The caller (`TextImportService`) chunks review batches at 120
  sentences per worker call for progress and cancellation; the worker still
  yields internally between token chunks through the same path `analyze`
  uses. See [0009](decisions/0009-language-protocol-v2-analyze-sentences.md).
- **Repository port additions**: `countParagraphs` and `locateSentence` on
  `ReadingRepository`, both bounded indexed lookups, so the reader can size its
  window and resolve a resume position without loading the reading's text.
- **Domain** (`src/app/domain/reading/`, each with a focused spec):
  `import-text.ts` (UTF-8 decode, 50,000-code-point limit, typed rejections),
  `import-title.ts`, `import-draft.ts` (split/merge), `import-structure.ts`
  (paragraph/sentence assembly, sentence-text trimming — see
  [0010](decisions/0010-sentence-text-boundary-trimming.md)),
  `reading-position.ts` (resume basis, progress fraction — see
  [0012](decisions/0012-resume-basis.md)), `paragraph-window.ts` (window sizing
  and extension — see [0011](decisions/0011-paragraph-window-bounds.md)),
  `deletion-plan.ts`, `token-presentation.ts`.
- **Application** (`src/app/application/reading/`): `text-import.service.ts`,
  `import.store.ts`, `library.store.ts`, `reader.store.ts`,
  `vocabulary-classification.service.ts`, `word-inspector.store.ts`.
- **Features**: `features/add-text/` (paste/file, review, unsaved-exit guard),
  `features/library/` (list, filters, Continue reading, delete),
  `features/reader/` (paragraph window, ruby, aids, word inspector as a side
  panel on desktop and a bottom sheet on Android), plus
  `shared-ui/confirm-dialog/`.
- **Routing**: `/library`, `/add`, `/reader/:id`; `first-use.resolver.ts` sends
  a profile with readings to the Library and everything else to Add text;
  `route-chrome.ts` marks the reader as a focused route so bottom navigation is
  hidden there; `withComponentInputBinding()` feeds the reading id to the
  reader.

### Defects found and fixed along the way

- The committed grammar UI referenced CSS variables that do not exist
  (`--color-border`, `--color-accent`, `--color-surface-raised`,
  `--color-focus`, `--color-text-muted`, `--text-sm`, `--text-lg`,
  `--radius-2`), so its cards had no border, no background, and an invisible
  focus ring. Mapped to the real semantic tokens and added `--text-sm/md/lg`
  to `src/styles/_tokens.scss`.
- `@angular/cdk/overlay-prebuilt.css` and `a11y-prebuilt.css` were never
  imported. Every dialog and sheet, including the Milestone 0 More sheet, was
  rendering without overlay positioning or a backdrop. Added to
  `src/styles.scss`. See
  [0013](decisions/0013-cdk-overlay-stylesheet-requirement.md).
- The reader grid placed children into named areas that only existed in the
  inspector layout, so the header and the text stacked in one cell and the
  header swallowed clicks on the first line. Areas are now named in both
  layouts.
- The reader header is now sticky with its own stacking context, because ruby
  annotations overflow above their line and covered header controls.
- `ReaderStore.open` recorded `markOpened` after loading text, which raced
  Continue reading. It now records opening before the text loads.

### Checkpoint evidence

| Requirement | Evidence |
| --- | --- |
| Fresh offline app imports, saves, reopens, inspects, resumes, filters, deletes | `e2e/reading.spec.ts` scenarios 1, 2, 14, and the offline half of 15 |
| No Anki or AI request at any point | `inspecting a word shows local details with no request leaving the origin` asserts zero off-origin requests; `the reader states that vocabulary is not configured` covers the no-Anki path |
| Desktop keyboard and Android touch/accessibility flows pass | Every `e2e/reading.spec.ts` scenario runs on both the `desktop-chrome` and `android-chrome` Playwright projects; `expectNoSeriousAccessibilityViolations` runs an axe scan at each major step; Escape closes the mobile word sheet and restores focus to its token (desktop is exempt — the inspector is a side panel there, not a dialog) |
| Long-reader rendering meets the performance/reflow requirement | `e2e/reading-performance.spec.ts` at the real 50,000-character budget — see Measured performance baseline |
| Resume states an approximation rather than hiding it | `reading-position.spec.ts`, `reader.store.spec.ts` (`exact`/`nearest`/`beginning`), and the reader's `nearest` notice |
| Delete cascades to zero owned orphan rows and Continue reading self-repairs | `deleting asks first, then leaves zero owned orphan rows` and `Continue reading repairs itself when its target is deleted` |
| Library's first page never scales with library size or reads audio bytes | `dexie-reading.repository.spec.ts` — `reads a bounded number of rows and never touches audio or text tables`, spying on every child table |

### Measured performance baseline

Windows 11, Node 24.4.1, Chromium via Playwright, on the development machine.
Real Android 12 midrange figures are recorded in Milestone 10 against the
deployed build; the `android-chrome` Playwright project here is touch-emulated
desktop Chromium, not a real device.

| Measurement | Value |
| --- | --- |
| Import fixture size | 50,000 characters exactly, 200 paragraphs, one sentence each |
| Paragraphs mounted when the reading first opens | 4, against a bound of 15 |
| Paragraphs mounted at any point while scrolling to the end | never exceeds 15 |
| Long tasks from segmentation through opening the reader | none observed over the 50ms long-task threshold |
| Production build, initial bundle | 815.21 kB raw, 188.06 kB transfer |
| Production build, reader route (lazy) | 34.41 kB raw, 8.93 kB transfer |
| Production build, language worker (lazy) | 363.34 kB raw, 64.33 kB transfer |

The paragraph-window bound is asserted in CI at 15 mounted paragraphs
(`MAXIMUM_MOUNTED_PARAGRAPHS`); the 4-paragraph opening figure and the
long-task measurement are recorded here as prose rather than asserted exactly,
because they vary with runner load. The long-task assertion in
`reading-performance.spec.ts` uses a 100ms bound — deliberately looser than the
strict 50ms long-task definition — because measurements on a shared CI runner
land close to that line from scheduler noise alone; the test file is run
serialized to reduce that noise. See
[0011](decisions/0011-paragraph-window-bounds.md) for why 15/3/3 were chosen
and why the window moves rather than growing.

### Verification

| Command | Result |
| --- | --- |
| `npm run format:check` | Pass |
| `npm run lint` | Pass (0 problems) |
| `npm run typecheck` | Pass |
| `npm run assets:verify` | Pass — 22,629 dictionary entries, 256 rules, 177 baseline entries |
| `npm test` | Pass — 43 files, 461 tests |
| `npm run test:coverage` | Pass — 86.9% statements, 80.9% branches, 87.5% functions, 86.9% lines overall (gate: ≥85%/≥80%/≥85%/≥85%) |
| `npm run build` | Pass — 815.21 kB initial, 188.06 kB transfer |
| `npm run e2e` | Pass — 81 tests, 1 intentionally skipped (desktop-chrome, android-chrome) |

### Assumptions and decisions

- [0009 — Language protocol version 2 and `analyze-sentences`](decisions/0009-language-protocol-v2-analyze-sentences.md)
- [0010 — Sentence text drops the line breaks and padding that end a segment](decisions/0010-sentence-text-boundary-trimming.md)
- [0011 — Paragraph window bound, radius, step, and moving rather than growing](decisions/0011-paragraph-window-bounds.md)
- [0012 — Resume basis: exact, nearest, or beginning, stated rather than hidden](decisions/0012-resume-basis.md)
- [0013 — The CDK overlay and a11y stylesheets are a hard build requirement](decisions/0013-cdk-overlay-stylesheet-requirement.md)
- **No sentence action row.** Translate, audio, grammar analysis, and sentence
  details arrive with Milestones 7–9. `ux-ui-specification.md`'s reader section
  describes the affordance; its absence here is a deliberate deferral, not an
  omission.
- **`translationsExpanded` is persisted but inert.** The reader aid is stored
  and shown in the Aids panel, but controls nothing visible yet because no
  translation UI exists until Milestone 7.
- **The Library has no Generate button.** That route, and the readings it
  would produce, arrive in Milestone 7.
- **The reader header has a delete button, not an overflow menu.** Metadata
  and delete both living behind one overflow control is deferred until there
  is a second action to justify a menu.
- **Scenario 15 (offline reading) is covered for in-application navigation
  only.** `e2e/reading.spec.ts` removes the network after the library route's
  lazy chunk is already loaded and proves the reading data and aids are fully
  local from that point. Surviving a full offline *reload* needs the
  service-worker shell fallback, which is Milestone 10; the e2e test states
  this in a comment, and it is restated here so the gap is recorded in one
  more place than just the test file.
- Coverage below the ≥90%/≥95% branch/line bar for "repository transactions"
  exists in several Dexie repositories this milestone did not touch —
  `dexie-enrichment.repository.ts`, `dexie-grammar.repository.ts`,
  `dexie-job.repository.ts`, `dexie-credential.repository.ts`,
  `dexie-settings.repository.ts`, `dexie-source-mapping.repository.ts`,
  `dexie-vocabulary.repository.ts`. These belong to Milestones 1, 4, and 5–9
  respectively. `dexie-reading.repository.ts`, the one this milestone owns and
  extended, was brought to 93.8% branches / 100% lines, meeting the bar. The
  others are a follow-up for whichever milestone next touches them, not a gap
  introduced here.
- Grammar catalog content defects: two ungrammatical example sentences and two
  pattern/name field mismatches, confirmed and reported at the time in
  `docs/grammar-catalog-defects.md`. They never blocked the reader. Milestone 4
  deleted the catalog instead of repairing it, and folded this evidence into
  [ADR 0014](decisions/0014-remove-grammar-rule-catalog.md).

### Remaining work in later milestones

- Grammar profile screen, Anki, OpenRouter, generation, enrichment, and audio
  (Milestones 4–9).
- PWA manifest, icons, install UX, and the offline shell fallback that would
  complete scenario 15's offline-reload half (Milestone 10).
- A full manual language review of the grammar catalog was a release gate here;
  Milestone 4 removed it by deleting the catalog.

## Milestone 4 — Grammar profile

### Delivered

The grammar profile was specified as 256 individually selectable catalog rules.
[ADR 0008](decisions/0008-grammar-profile-presets.md) replaced that with six
ordered difficulty presets carrying prose guidance, and delivered the preset
data, build validation, domain types, Dexie migration, `GrammarProfileStore`, and
the `/grammar` picker. This milestone finishes the work and removes what 0008
left behind.

#### The rule catalog is deleted

[ADR 0014](decisions/0014-remove-grammar-rule-catalog.md) records the decision
and its evidence. The catalog survived 0008 for three consumers — a searchable
reference screen, a display lookup for naming Milestone 8 findings, and a
build-time pattern lint — none of which was built, and none of which paid for a
dataset carrying roughly 24 mismatched ids, two near-duplicate rules, eight bare
kanji grammatical labels where a readable pattern was expected, and
`searchAliases` empty on all 256 entries.

- Removed: `data/language/grammar-catalog.source.json`, the shipped
  `grammar-catalog.json`, `domain/grammar/rules.ts` (`CatalogGrammarRule`,
  `JlptLevel`, `JLPT_LEVELS_EASIEST_FIRST`), `GrammarRuleId`/`grammarRuleId`,
  `grammarRuleIdSchema`, and `LanguageRuntimeInfo.grammarRuleCount`.
- `scripts/assets/build-grammar-catalog.mjs` became `build-grammar-presets.mjs`,
  keeping the preset and register-guidance validation from 0008 verbatim. The
  quoted-pattern cross-check lost its corpus and became a structural check on the
  same regex: non-empty, no trailing punctuation carried in from the prose, and
  no pattern named twice in one guidance string.
- Presets ship as the fourth bundle component, `grammarPresets`, carrying
  `presetCount` — taking the manifest slot the catalog vacated, so
  `LanguageAssetSettings` still records four component versions. Renamed
  throughout: `GrammarPresetsComponent`, `grammarPresetsVersion`,
  `grammarPresetsAssetSchema`. Per CLAUDE.md the settings schema was edited in
  place; there is no v2 and no migration.
- The shipped bundle drops from 86,088 to 6,809 bytes for this component, a
  saving of 77 KB.

#### Profile hashing and capture

`profileHash` was declared on `GrammarProfileSnapshot` and indexed in Dexie, but
nothing computed it. New `domain/grammar/profile-hash.ts`:

- `grammarProfileHash()` hashes exactly the resolved guidance, the register
  preference, and the structural-baseline version, over `hashCanonical` with a
  `grammar-profile` domain prefix per
  [ADR 0002](decisions/0002-hashing-and-canonical-serialization.md). Covering
  nothing else is the point: a preset copyedit that leaves the resolved text
  unchanged, or a dictionary refresh, must not stale every stored analysis.
- `captureGrammarProfile()` builds the snapshot through the same
  `resolveGuidance()` the prompt uses, so the hashed text and the sent text
  cannot diverge. The snapshot is frozen and content addressed — its `id` is its
  hash — so `GrammarProfileStore.captureProfile()` reuses an existing capture
  rather than rewriting `capturedAt` on an immutable record. It has no caller
  until Milestone 7, and no speculative UI is wired to it.

#### Grammar screen

- `structural-baseline-section.component.ts` publishes the 177 baseline entries
  read-only, grouped by `StructuralBaselineCategory`, with `lang="ja"` on every
  Japanese string. It is collapsed behind a disclosure so it cannot push the
  picker off the first screen. `STRUCTURAL_BASELINE_CATEGORIES` moved into the
  domain and is now the single source for the type, the asset schema enum, and
  this ordering.
- The page gained an `aria-live="polite"` status naming what was saved — the new
  preset, register, or wording — and stating that existing grammar analyses are
  out of date. The store reports the change as typed data
  (`GrammarProfileChange`); the sentence is built in the feature layer.
- No reference section. The searchable catalog and the rule detail sheet are out
  of scope, not deferred.
- `setCustomGuidance('')` now resets to the preset instead of storing an empty
  override, which the store's bounds check had previously allowed through.

### Checkpoint evidence

| Roadmap checkpoint | Evidence |
| --- | --- |
| Preset, register, and custom-variant state survive reload | `e2e/grammar.spec.ts` — preset and custom wording asserted after `page.reload()` on desktop and Android |
| Profile hashes change only for prompt-relevant content | `profile-hash.spec.ts` — stable across caption, description, and example copyedits; changes for guidance, register, and baseline version |
| Fresh installs default to `Starter forms` and can generate immediately | `e2e/grammar.spec.ts` first test; no empty-profile gate exists |
| No preset name contains a JLPT level | `language-asset-bundle.spec.ts` asserts it on the shipped asset; the build rejects it at authoring time |
| No rule catalog ships in the bundle | `public/assets/language/1/` holds `grammar-presets.json` only; `manifest.json` lists four components with `grammarPresets` at `presetCount: 6` |
| Keyboard-only traversal | `e2e/grammar.spec.ts` arrow-key traversal of the radiogroup, desktop project |
| Accessibility | `expectNoSeriousAccessibilityViolations` on the picker and on the expanded baseline list, both projects |

Inspected in the running app at 1280 px and 360 px: preset selection persists
across reload, the wording editor saves and resets, the baseline expands to 177
entries across 9 categories, there is no horizontal overflow at 360 px, the
disclosure and action targets measure 44 px, and the console is clean.

### Verification

| Command | Result |
| --- | --- |
| `npm run format:check` | Pass |
| `npm run lint` | Pass (0 problems) |
| `npm run typecheck` | Pass |
| `npm run assets:verify` | Pass — 22,629 dictionary entries, 6 presets, 177 baseline entries |
| `npm test` | Pass — 47 files, 496 tests |
| `npm run test:coverage` | Pass — 87.6% statements, 81.5% branches, 88.1% functions, 87.5% lines (gate: ≥85%/≥80%/≥85%/≥85%) |
| `npm run build` | Pass — 815.30 kB initial, 188.55 kB transfer |
| `npm run e2e` | Pass — 90 tests, 2 intentionally skipped (desktop-chrome, android-chrome) |

### Assumptions and decisions

- [0014 — Remove the grammar rule catalog](decisions/0014-remove-grammar-rule-catalog.md).
  Numbered 0014 rather than the 0009 the plan named, because 0009–0013 were taken
  by Milestone 3.
- **Captures are content addressed.** `GrammarProfileSnapshot.id` is its
  `profileHash`. The alternative — a UUID per capture — would store
  byte-identical rows for every story generated under an unchanged profile, with
  `capturedAt` the only thing distinguishing them. First write wins, so a capture
  is genuinely immutable.
- **`captureProfile()` reports a missing bundle as `unavailable`.** The port
  fails with `StorageError`, and a profile cannot be captured before the presets
  and the baseline version have loaded. `unavailable` is retryable, which is the
  correct signal: the caller can retry once assets are ready.
- **The register labels moved to `features/grammar/register-labels.ts`.** The
  change confirmation and the register control must agree on what a register is
  called; sharing the map is cheaper than keeping two copies in step.
- `docs/grammar-catalog-defects.md` is deleted. It documented a dataset that no
  longer exists; its findings are recorded in ADR 0014 as evidence.

### Remaining work in later milestones

Deferred deliberately: each needs a pipeline that does not exist yet, so there is
nothing to wire them to. The milestone plan that scheduled them has been deleted
now that the milestone is delivered.

- `StoryGenerationRequest.grammarGuidance` and `registerPreference`, and the
  60,000-token `context-budget-exceeded` guard (Milestone 7).
- The non-blocking preset/snapshot-size mismatch warning (Milestones 5 and 7).
- Grammar review judging novelty against the captured guidance (Milestone 8).
- Language review of the six preset guidance texts remains a release gate, as
  ADR 0008 established.

## Milestone 5 — Anki vocabulary

### Delivered

Everything downstream of a vocabulary snapshot already existed: the matcher, the
classification precedence, the Dexie tables, and the atomic commit. What was
missing was the producer, so `activeSnapshotId` was permanently null and no
reader marker could ever appear. This milestone builds the three read-only
sources, the refresh that turns them into one immutable snapshot, and the screen
that drives it.

#### Read-only by construction

The AnkiConnect client's `invoke` is private and its action parameter is typed
`AllowedAction`, whose eight entries are all reads. There is no public method
that takes an action name, so a write action is a compile error rather than
something review has to catch. `allowed-actions.spec.ts` also checks the list
against the mutating verbs AnkiConnect uses and reads the client's own source to
confirm nothing else reaches the wire.

The package pipeline is read-only the same way: `CollectionDatabase` exposes
only `query` and `close`, with no `run` or `exec`. Media members are listed from
the central directory and never decompressed.

#### Three sources, one contract

`runProviderContract` is one suite every provider passes — the reference fake,
the package pipeline across four package formats, and both HTTP adapters against
a deterministic fake AnkiConnect server. A snapshot has to mean the same thing
whichever source built it, and three genuinely different implementations
answering identically is what makes that true rather than hoped for.

Eligibility is decided from each card's own `reps`, never from a search term
like `-is:new`: a card studied and later forgotten returns to the new queue while
keeping its review count. A card in a filtered deck resolves its home deck
through `odid`, so Custom Study cannot move it out of a mapping.

#### Packages

See [ADR 0016](decisions/0016-anki-package-parsing.md). The ZIP reader is
written directly against the format so the safety checks are ours; `fzstd`
decodes the zstd collection modern Anki writes; `sql.js` opens it. Both
libraries are imported lazily inside a dedicated worker that is terminated
after use, so the initial bundle is unchanged and the WebAssembly heap is
actually reclaimed.

Two collection layouts are supported behind one reader, chosen by which tables
exist rather than by version number: normalized (schema 18) and JSON in the
`col` row (schema 11).

#### The refresh

The state machine's ordering carries the guarantee. Every state before
`committing` can be cancelled or fail without touching stored data;
`committing` is the one non-cancellable state because it is a single
transaction that either replaces the active snapshot or leaves it exactly as it
was. The prepared snapshot waits for confirmation, and extracted values live
only in the store.

Only distinct expressions are tokenized — a deck with heavy duplication would
otherwise pay for the same analysis many times.

### Verified

- 834 unit tests, including the shared contract across five provider
  configurations and the full refresh state machine.
- 14 synthetic package fixtures, built reproducibly from Node built-ins and
  checked byte for byte by `npm run verify`. They cover both schema layouts,
  zstd and deflate, `.colpkg`, filtered decks, missing review data, unsafe
  paths, encryption, unsupported compression, and a decompression bomb.
- 16 end-to-end tests on desktop and Pixel 5, covering the package path through
  to reader markers, the AnkiConnect path, discard, missing review evidence, and
  two named failures. Axe finds no serious or critical violations.
- Manual compatibility pass against a real 1,500-note export kept outside the
  repository (`npm run test:manual`): deck `Kaishi 1.5k`, note type
  `Kaishi 1.5k+`, field `Word`, **150 eligible entries**, zero rejections. The
  collection decompresses in about 35 ms.
- Driven in the browser end to end: a package import produced the expected
  counts (6 reviewed notes, 5 with text, 1 empty skipped, 1 duplicate merged,
  4 unique), committed, and the reader then marked ねこ, 見る, and 犬 as known.
  No horizontal overflow at 320 px and no tables on the page.

### Fixed along the way

- **The reader claimed vocabulary was not configured on a cold start.** Opening
  a reading by URL reaches classification before the language worker has loaded
  its assets; compiling a matcher then failed, and the reader fell back to "no
  reviewed Anki vocabulary is set up" — telling the learner to fix something
  that was not broken. `VocabularyClassificationService` now waits for the
  runtime, and `vocabularyNotConfigured` no longer reports a failure as an
  absent snapshot.
- **The Active snapshot badge failed colour contrast** at 2.4:1, because it
  named a `--surface-base` token that does not exist and inherited a dark
  foreground. It now uses the design system's soft pairing: 5.25:1 light,
  6.65:1 dark.
- Added the `DexieSourceMappingRepository` spec that Milestone 1 left out.

### Assumptions

- **What stops a deployed page is the origin allowlist, measured, not the
  private-network preflight.** AnkiConnect (`2055492159`, Anki 25.x) answers
  every preflight with `Access-Control-Allow-Private-Network: true` regardless
  of origin, and answers a request from an origin outside `webCorsOriginList`
  with `403` plus a mismatched allow-origin header, which the browser rejects
  during CORS. Loopback is exempt whenever `http://localhost` is allowed, and a
  real run of the vocabulary page at `http://127.0.0.1:4200` connected and
  listed a real collection. An opaque transport failure is therefore reported as
  `origin-not-allowed`, and `private-network-blocked` has been removed — the
  application has no evidence that could distinguish it. See ADR 0017.
- A collection with review counts present but all zero is reported as zero
  eligible entries plus a warning that scheduling information may have been
  excluded from the export. The two are not distinguishable from the data, so
  the warning names the possibility rather than asserting it.

### Remaining

- Setup and troubleshooting documentation for desktop AnkiConnect, the Android
  bridge, and the package fallback lands in Milestone 10.
- The non-blocking preset/snapshot-size mismatch warning needs Milestone 7.
- The Android bridge has been exercised against a fake and against the shared
  contract, never against a real device. That belongs to the Milestone 10
  compatibility matrix.
- A deployed HTTPS page reaching `127.0.0.1` from the learner's own Chrome
  profile has not been observed; only loopback has. Chrome gates some
  private-network behaviour on secure contexts, so that row of the Milestone 10
  compatibility matrix is still open.


## Milestone 6 — OpenRouter and settings

### Delivered

#### One request path, and only one

`OpenRouterClient` (`src/app/infrastructure/openrouter/openrouter-client.ts`) is
the only place an OpenRouter request is made. There is no general-purpose "call
any URL" surface: the path comes from a module constant, the assembled URL is
parsed and checked against the configured origin before an authorization header
exists, and the key is readable only inside `CredentialRepository.useApiKey`'s
callback — it is never assigned to a field, a signal, a log, or an error.

The client owns every per-request invariant so a task adapter cannot forget one:
timeout with an internal controller plus caller-signal forwarding, cancellation,
status and content-type validation, declared-length and buffered size limits,
zod validation of the body, and mapping onto a typed `AiError`. Bounded retry
lives in `retry-policy.ts`: at most two automatic attempts with capped
exponential backoff and jitter, only for rate limits, provider outages, and
network interruption, never after cancellation, and never for authentication,
unknown models, missing capabilities, or schema failures. A `Retry-After` longer
than ten seconds ends the attempt instead of blocking behind a spinner.

Offline is decided through an injected predicate before the credential is
unlocked, so an offline device never spends an attempt and never reads the key.

#### Two ports, tested independently

`TextGenerationProvider` and `TextToSpeechProvider` (`src/app/domain/ai/`) carry
the names from the architecture specification but declare only
`testConfiguration`; the generation, review, translation, and synthesis methods
arrive with the milestones that implement them. See
[ADR 0018](decisions/0018-openrouter-request-boundary.md).

The text tester sends a minimal structured probe to the exact model using
provider-native `json_schema`. If the provider refuses that parameter, or the
model answers in the wrong shape, it makes exactly one recovery request under a
strict JSON contract and records which mode worked. A failing model therefore
costs at most two calls, and a model that cannot be held to an exact structure
cannot be used for generation however well ordinary chat works.

The TTS tester synthesizes one fixed Japanese phrase at the exact model, voice,
and speed, then validates MIME, size, and decodability through an injected
decoder. A provider that rejects `speed` is retried once without it and the
result records `speedApplied: false`, which the screen states plainly rather
than implying the setting took effect.

#### Readiness derived, never flagged

`configuration-fingerprint.ts` hashes the key generation, the exact IDs, the
endpoint version, and the test version. Readiness is a comparison between the
stored fingerprint and the current one (`configuration-readiness.ts`), so
changing a model, a voice, the speed, or the key marks the matching test stale
with no code remembering to invalidate anything. The two fingerprints share no
input beyond the key generation, which is what makes text and TTS readiness
independent by construction.

The key itself never enters a fingerprint. The credential's `updatedAt` is used
as a generation counter instead: a hash of a secret is still derived from the
secret, and fingerprints live in ordinary settings rows.

#### Settings screens

Three new sections precede the existing ones: **OpenRouter text** (key entry,
save/replace, two-step removal, configured indicator, exact model ID, and Test
configuration with cancellation), **Text to speech** (exact model, voice, speed,
Test voice, and an explicit Play sample button), and **Generation policy** (one
textarea, length limit, save state). No reveal toggle exists, the key input is
cleared the instant its value is handed to the repository, and a shared
`mn-configuration-status` renders readiness and failure recovery without either
section being able to show the other's state.

`ai-error-copy.ts` gives all twelve failure variants their own heading, what
failed, what did not fail, primary action, and escape path, plus a copyable
technical code. Diagnostics now also reports the provider protocol and the
internal prompt versions.

### Verified

- 1,048 unit tests across 92 files, including a deterministic fake OpenRouter
  server (`src/testing/openrouter-server.ts`) and a shared port contract suite
  (`src/testing/ai-provider-contract.ts`) run against both adapters.
- Coverage 87.5% statements / 81.2% branches overall. Every new module clears
  the stricter provider gate: error mapping 100/95, client 99/94, text adapter
  97/97, TTS adapter 97/91, stores 96–100 / 94–100.
- 36 new end-to-end tests on desktop Chrome and a Pixel 5 viewport: key
  save/replace/remove with the value absent from the DOM, the console, and the
  stored settings row; text-model pass and reload; staleness on model change and
  key replacement; not-configured after key removal with the model kept; 401,
  404, 429, and 500 each producing their own recovery; a model that cannot hold
  the structure; offline entering an offline state rather than hanging;
  cancellation of an in-flight request; TTS failure leaving text readiness
  untouched; audio the browser cannot store; policy persistence across reload;
  zero provider requests while configuring or on the library route; and axe
  clean with the AI sections in a failed state.
- Browser-driven check of the rendered settings route at desktop, 375px, and
  320px, in light and dark, with no page-level horizontal scrolling and no
  console errors.
- One live check against the real OpenRouter with a deliberately invalid key:
  the 401 mapped to `authentication` and rendered the full recovery copy with
  code `ai/authentication`.

### Assumptions

- **OpenRouter has no single documented synthesis endpoint**, so speech targets
  the OpenAI-compatible `POST /audio/speech` shape with `response_format: mp3`.
  The path is a constant and the request is built in one adapter; an
  incompatible provider fails at configuration time with
  `capability-unsupported` rather than mid-reading. See ADR 0018.
- **402 is reported as an authentication failure.** OpenRouter uses it for an
  exhausted account and the specified failure model has no variant for it; it
  sends the learner to the same place a rejected key does, and the copy names
  both causes.
- The compatibility probe asks for a two-field JSON object. It is deliberately
  the smallest task that still proves exact structured output, so a failure is
  attributable to formatting rather than to task difficulty.

### Remaining

- A real configured text model and a real TTS model/voice have not been
  exercised end to end; only a rejected key has. That belongs to the Milestone
  10 manual compatibility matrix.
- The remaining port methods — story generation, repair, exception review,
  grammar review, translation, and synthesis — arrive with Milestones 7 to 9,
  along with the `AiTask` variants that name them.
- Install and update controls in the storage section are still Milestone 10.

## Milestone 7 — Generation and local validation

### Delivered

#### The request contract and every rule live in the domain

`src/app/domain/ai/` gains the pieces a story is judged by, each small enough to
test on its own: `story-request.ts` (the request, the two sentence ranges, the
1,000-character input limits measured in code points), `story-structure.ts`
(unique contiguous indexes from zero, nonempty title and sentences, outer
whitespace trimmed and nothing else, a wrong sentence count reported as
_repairable_ rather than malformed), `exception-review.ts` (a decision must name
an input id exactly once and give a real reason; rejected, unreviewed, and
invalidly decided candidates all stay unknown), `suggestion-palette.ts` (a
partial Fisher–Yates shuffle over an injected `RandomSource`, 40 for Micro and
100 for Short, capped by snapshot size), `context-budget.ts` (a deterministic
estimate and the 60,000-token guard that fails before spending), plus
`prompt-versions.ts` and `generation-provenance.ts`.

`RandomSource` is a new port in `domain/shared`, implemented over
`crypto.getRandomValues` with rejection sampling so the last vocabulary items are
not quietly less likely to be suggested than the first.

#### Prompts are assembled in the adapter, in four immutable layers

`infrastructure/openrouter/prompts/` builds protocol, product policy, versioned
task instructions, and then captured user data inside delimiters that the data
itself cannot close. The policy layer states in so many words that learner
instructions may guide style, viewpoint, tone, dialogue, and register, and cannot
change the sentence count, the schema, the vocabulary policy, or the validation.

`story-generation.adapter.ts` implements `generateStory`, `repairStory`, and
`reviewExceptions` over the existing client, and owns exactly one policy: a
single format-recovery request per malformed structured reply. The domain's
structural check runs inside its reply reader, so that one recovery covers a
missing title, an empty sentence, and a duplicate or missing index — but never a
story of the wrong length, which is well formed and spends a content repair
instead. `OpenRouterTextProvider` composes the tester and the generator so
neither file grows a second job, and loads the generator on first use so its
prompts stay out of the initial bundle. See
[ADR 0019](decisions/0019-generated-story-structure.md).

#### The state machine, and what it refuses to do

`application/generation/generation.store.ts` runs the specified states and is
provided by the Generate page, so leaving the screen discards the draft. It
captures the snapshot, the grammar profile (`GrammarProfileStore.captureProfile`
finally has a caller), the exception policy, the model, and the prompt versions
before the first request, so a setting changed mid-run cannot change what the
running story is judged against.

After every candidate — the first and each repair — the whole returned Japanese
is tokenized and classified again from scratch in `generated` mode, and every
exception decision is asked again. Nothing from an earlier pass survives into a
later one, because a model's claim to have fixed a word is not evidence that it
did. At most two content repairs are spent; after that the result is an
`invalid-draft` that lives in feature memory and has no path to storage.

#### One transaction, and two independent refusals

`ReadingRepository.saveGeneratedStory` writes the reading, its paragraph,
sentences, token analyses, frozen validations, and provenance in a single
transaction, mirroring `saveImportedReading`. `repositories/integrity.ts` refuses
any draft whose frozen validation still carries `unknown` — or the imported-only
`not-in-snapshot` — and any provenance that describes a different run. The store
refuses the same draft before it ever gets there; both checks exist because one
is a promise and two independent ones are an invariant.

An accepted story is saved with its auxiliary summaries empty
(`grammarSummary: not-requested`, translations and audio `0/N`). Milestone 8
fills those branches in on top of this save path.

#### The Generate screen

Three independently actionable checks, each linking to the screen that fixes it
with the draft surviving the trip (it lives in a root-provided
`GenerationDraftStore`, unlike the run itself). TTS is named as optional and
carries no state. The grammar preset is a read-only line with a non-blocking
warning when the preset outruns the snapshot — the item Milestones 4 and 5
deferred here.

The form has a premise with a live counter, Micro and Short cards with their
ranges, optional special instructions, read-only snapshot and preset links, and a
Generate button that says a request is coming and estimates no price. There is no
genre picker, no topic suggestions, no visible target vocabulary, no temperature,
and no prompt editor.

The nine specified stages render through a new `shared-ui/stepper`, which
`features/vocabulary/refresh-stepper.component.ts` was refitted onto — two
workflows with one state vocabulary is a real shared concept. Grammar review and
translation show as Skipped rather than being hidden. The invalid draft shows the
unsaved Japanese with the offending words marked, the issue list, the repair
count, and **Try a new generation / Change premise or instructions / Close**,
with confirmation on Close and no Save anyway.

`ai-error-copy.ts` moved to `shared-ui/ai-error/` so Generate and Settings share
one table, and gained a phrase per `AiTask` so a failure can say what it
interrupted.

#### Persisted structured-output mode

`TextModelSettings.structuredOutput` records what a successful test proved, so
generation opens in the mode the model is known to honour instead of spending a
recovery request every run to rediscover it. A row written before the field
existed reads as "nothing proved yet" rather than as a corrupt record. See
[ADR 0020](decisions/0020-persisted-structured-output-mode.md).

### Checkpoint evidence

| Requirement                                                | Evidence                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict pass                                                | `generation.store.spec.ts` — 1 provider call, saved, `validationOutcome: strict`                                                                                                     |
| Exception approved                                         | 2 calls; the word saves as `policy-exception` with its explanation, never as `anki-*`                                                                                               |
| Repair success on full reparse                             | 3 calls (story, review, repair); `repairAttempts: 1` recorded in provenance                                                                                                         |
| Repair failure after two repairs                           | 3 calls, `invalid-draft`, and zero rows in every owned table                                                                                                                        |
| Malformed reply and bounded format recovery                | `story-generation.adapter.spec.ts` — prose costs exactly 2 calls; a duplicate index is malformed and never returned; a wrong-length story costs 1 and is repaired instead            |
| Cancellation at each cancellable state                     | `generation.store.spec.ts` — prerequisites, writing, validating, exception review, and repairing each end `cancelled` with nothing saved; `canCancel()` is false once saving starts   |
| Hard model failure                                         | An authentication failure is not repaired and writes nothing                                                                                                                        |
| No unknown-containing result can enter the library         | `dexie-reading.repository.spec.ts` refuses `unknown` and `not-in-snapshot` drafts and writes zero rows; the store refuses independently                                              |
| Cancelled/invalid results create no reading rows           | `e2e/generation.spec.ts` counts every owned store after an invalid draft and after a cancellation                                                                                    |
| Provenance captured                                        | Snapshot, profile capture, policy hash, model, prompt versions, repair count, and sampled item ids asserted on the stored row                                                        |

### Verification

| Command                | Result                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm run format:check` | Pass                                                                                      |
| `npm run lint`         | Pass (0 problems)                                                                         |
| `npm run typecheck`    | Pass                                                                                      |
| `npm test`             | Pass — 101 files, 1,160 tests                                                              |
| `npm run build`        | Pass — 848.82 kB initial, 198.64 kB transfer; the Generate page is a 40.80 kB lazy chunk    |
| `npm run e2e`          | Pass — 156 tests, 14 of them new (desktop-chrome, android-chrome)                           |

Browser-driven check of the rendered `/generate` route at 1280 px and 360 px in
light and dark: the prerequisite panel, the form, the stepper progressing, a
saved story, and an invalid draft, with no console errors and no page-level
horizontal scrolling. The invalid-draft and saved states were driven through
Playwright, because reaching them needs a key, a tested model, and a real
vocabulary snapshot in IndexedDB.

### Assumptions and decisions

- **An accepted story is saved in this milestone**, with empty auxiliary
  summaries, so that "no unknown-containing result can enter the library" and
  "cancelled/invalid results create no reading rows" are provable end to end
  rather than deferred to Milestone 8.
- **A generated story is one paragraph.** A model returns ordered sentences and
  no structure above them; any split would be invented and then presented as if
  it came from the source. See ADR 0019.
- **The structural baseline reaches the model as plain forms.** The
  `PromptGrammarRule` the AI specification names was removed in ADR 0014; the
  model needs only the fact that these function words stay available, which a
  form list states in roughly 400 tokens.
- **An exception explanation must be at least twelve characters and must not
  restate the verdict.** The specification invalidates "empty or vague" without
  defining vague; the check is deliberately conservative, because a discarded
  decision costs a repair attempt while a lenient one would cost an unearned
  approval.
- **Preset-to-snapshot expectations are advisory numbers**, not a syllabus claim
  and not a gate. They exist for one non-blocking warning, so a learner with
  sixty words does not spend a request discovering that literary prose will not
  validate.

### Remaining work in later milestones

- Grammar review and translation, the `auxiliary-review` states, and the
  partial-failure completion summaries are Milestone 8; the stepper shows both
  stages as Skipped until then.
- A save that fails after acceptance keeps the candidate only as long as the
  screen lives. The specified "keep the final result in session long enough to
  retry saving" holds, but a dedicated retry action arrives with finalization in
  Milestone 8.
- No real model has generated a story end to end; only the routed stub has. That
  belongs to the Milestone 10 compatibility matrix.
