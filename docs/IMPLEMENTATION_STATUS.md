# Implementation status

Tracks progress against [docs/spec/implementation-roadmap.md](spec/implementation-roadmap.md).
Each milestone records what was built, how it was verified, assumptions taken,
and what remains.

| Milestone | State |
| --- | --- |
| 0 — Repository and decision scaffolding | Complete |
| 1 — Persistence foundation | Not started |
| 2 — Offline language assets and worker | Not started |
| 3 — Reader vertical slice | Not started |
| 4–10 | Not started |

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
- Build/version diagnostics in Settings (app version, build commit).
- Quality tooling: ESLint (strict type-checked rules, Angular template
  accessibility rules, layered import zones, no cycles), Prettier, `tsc -b`
  typecheck, Vitest unit tests, Playwright desktop + Android projects with an
  axe accessibility scan, and GitHub Actions CI plus a Pages deployment
  workflow gated on CI success.

### Verification

| Command | Result |
| --- | --- |
| `npm run format:check` | Pass |
| `npm run lint` | Pass (0 problems) |
| `npm run typecheck` | Pass |
| `npm run test` | Pass — 10 files, 35 tests |
| `npm run build` | Pass — 319.73 kB initial, 85.36 kB transfer |
| `npm run e2e` | Pass — 10 tests (desktop-chrome, android-chrome) |
| `npm audit --omit=dev` | 0 vulnerabilities |

Checkpoint evidence:

- Production build deploys to a Pages-like subpath: `npm run build:pages`
  emits `/monosai/` asset URLs, and hash routing keeps deep links reloadable.
- Desktop sidebar and mobile navigation both render and an accessible route
  (`/#/settings`) works, verified by component tests, Playwright at both
  viewports, and manual browser inspection.
- CI quality gates run on push and pull request.
- No feature imports infrastructure directly; enforced by
  `import/no-restricted-paths`.

### Assumptions and decisions

- [0001 — Angular 21 toolchain](decisions/0001-angular-21-toolchain.md):
  Angular 22 requires a newer Node than the environment provides.
- [0002 — Hashing and canonical serialization](decisions/0002-hashing-and-canonical-serialization.md).
- [0003 — Architectural boundary enforcement](decisions/0003-architectural-boundary-enforcement.md).
- The navigation registry lists only implemented destinations. Library, Add
  text, Generate, Vocabulary, and Grammar are appended as their milestones
  land, so navigation never points at an unimplemented route.
- Theme selection is applied immediately but is not yet persisted; persistence
  arrives with the settings repository in Milestone 1.

### Remaining work in later milestones

- PWA manifest, icons, install UX, and offline fallback (Milestone 10).
- Persistence, language assets, and all feature screens (Milestones 1–9).
