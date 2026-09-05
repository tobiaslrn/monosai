# 2. Architecture Constraints

These limits are given. The design must accept them. It cannot remove them. Where a constraint is
in fact a decision Monosai made for itself, the table says so and links to the record.

## 2.1 Technical constraints

| Constraint | Consequence for the architecture |
| --- | --- |
| **No backend of any kind** | There is no server to hold state, hide a key, proxy a request, or run a migration. Every capability is either in the browser or in a service the learner already owns |
| **Static hosting on GitHub Pages** | The build output is a folder of files. `angular.json` sets `baseHref` to `/monosai/` for the `pages` configuration, so any absolute path escapes the application |
| **No server rewrite rules** | The router uses hash locations, so a deep link survives a reload. The build also writes a `404.html` fallback |
| **Browser storage only** | Dexie over IndexedDB holds application data. Cache Storage holds the shell and the language assets. The browser may evict either, so the application must survive eviction |
| **Chrome on Windows, and Android 12 or newer** | Other browsers are not supported and not tested. The code may use current browser features without a fallback |
| **AI features need the network** | Reading, the dictionary, and saved content must not |
| **Anki access is read-only** | Desktop access uses the AnkiConnect add-on on `127.0.0.1`, limited by an action allowlist. Android access uses an AnkiConnect-compatible bridge. Package import reads an `.apkg` or `.colpkg` file on the device |
| **Bring your own OpenRouter key** | The learner supplies and pays for the key. It stays in IndexedDB on the device. OpenRouter is the only supported AI service |

## 2.2 Technology constraints

The stack is fixed. A replacement is a decision, not a preference. Versions are not repeated here;
`web/package.json` is the authority for them.

| Technology | Role |
| --- | --- |
| Angular, standalone components and signals | Application framework, router, service worker |
| Angular CDK | Overlays, focus management, accessibility primitives |
| TypeScript, in its strictest type-checked configuration | No `any`, no unchecked casts |
| Dexie over IndexedDB | Persistence, schema versions, transactions |
| Zod | Runtime validation at every boundary |
| A WebAssembly Japanese tokenizer with a bundled dictionary | Segmentation and morphology, in a worker. See [ADR 0005](../decisions/0005-tokenizer-selection.md) |
| A WebAssembly SQLite reader and a decompressor | Reads the collection inside an Anki package, in a worker. See [ADR 0016](../decisions/0016-anki-package-parsing.md) |
| Node | Build and tooling only. Nothing ships to the browser from Node |

Styling is SCSS with CSS custom properties. There is no runtime CSS framework.

## 2.3 Organizational constraints

| Constraint | Consequence |
| --- | --- |
| **One maintainer, and coding agents** | Rules that a reviewer would have to remember are enforced by tooling instead. See [ADR 0003](../decisions/0003-architectural-boundary-enforcement.md) |
| **One application build per CI run** | The `build` job produces the Pages artifact. The test jobs and the deployment consume that same artifact. The deployed bytes are the tested bytes. See [chapter 7](07-deployment-view.md) |
| **`gate` is the single required check** | A job blocks merging by joining the `needs` list of `gate`, so branch protection never has to change |
| **No accounts, no sync, no telemetry** | One learner per browser profile. Nothing measures the learner. Data does not move between devices |

## 2.4 Conventions

| Convention | Where it is defined |
| --- | --- |
| Layer dependency rule, enforced by the linter | `layerZones` in [`eslint.config.js`](../../eslint.config.js) |
| Design language for every visual and interactive change | [`docs/design-system.md`](../design-system.md) |
| Values behind the design language | `web/src/styles/_tokens.scss` and `web/src/styles/_controls.scss` |
| Commit message format, Conventional Commits with a required scope | [`AGENTS.md`](../../AGENTS.md) |
| Prettier formatting, checked in CI | `npm run format:check` |
| English-only user interface, Japanese-only content, one fixed locale for dates and numbers | `domain/shared/`, and [ADR 0042](../decisions/0042-cross-tab-reading-mutations.md) |
