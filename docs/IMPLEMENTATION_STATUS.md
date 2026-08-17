# Implementation status

Tracks progress against [docs/spec/implementation-roadmap.md](spec/implementation-roadmap.md).
Each milestone records what was built, how it was verified, assumptions taken,
and what remains.

| Milestone                                | State       |
| ---------------------------------------- | ----------- |
| 0 — Repository and decision scaffolding  | Complete    |
| 1 — Persistence foundation               | Complete    |
| 2 — Offline language assets and worker   | Not started |
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
