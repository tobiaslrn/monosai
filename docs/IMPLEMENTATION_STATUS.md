# Implementation status

Tracks progress against [docs/spec/implementation-roadmap.md](spec/implementation-roadmap.md).
Each milestone records what was built, how it was verified, assumptions taken,
and what remains.

| Milestone                                | State       |
| ---------------------------------------- | ----------- |
| 0 — Repository and decision scaffolding  | Complete    |
| 1 — Persistence foundation               | Complete    |
| 2 — Offline language assets and worker   | Complete    |
| 3 — Reader vertical slice                | Not started |
| 4–10                                     | Not started |

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
- Grammar catalog: 256 Monosai-authored rules (N5 58, N4 55, N3 50, N2 48,
  N1 45) with stable ids, patterns, English names, descriptions, formation
  summaries, and examples.
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
- Settings gains a Language assets section: state, active versions, a retry
  action, and the redistribution notices for all four datasets.

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
| Datasets never load before they are needed               | End-to-end assertion that no bundle request happens before the user asks                                        |

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
| `npm run build`         | Pass — 801.04 kB initial, 181.58 kB transfer; the language worker is a 362.38 kB lazy chunk (63.92 kB transfer) |
| `npm run e2e`           | Pass — 32 tests (desktop-chrome, android-chrome)                    |
| `npm audit --omit=dev`  | 0 vulnerabilities                                                   |

### Assumptions and decisions

- [0005 — Tokenizer selection](decisions/0005-tokenizer-selection.md)
- [0006 — Bundled dictionary dataset](decisions/0006-dictionary-dataset.md)
- [0007 — Grammar catalog and structural baseline](decisions/0007-grammar-catalog-and-structural-baseline.md)
- Language assets are prepared on request from Settings rather than during
  startup. The specification requires that basic navigation must not wait for
  the worker, and the tokenizer runtime is 13 MB; Milestone 3 will also trigger
  preparation from the import flow, where the user is already asking for
  analysis.
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
- A full manual language review of the 256 catalog rules and 177 baseline
  entries is a release gate, not a milestone gate.
