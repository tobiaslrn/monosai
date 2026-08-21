# Monosai

Monosai is a local-first Japanese reading application. Paste Japanese or open a
UTF-8 `.txt` file and read it with furigana, token spacing, part-of-speech
information, compact dictionary glosses, and vocabulary markers. Anki
vocabulary, story generation, translation, grammar review, and audio are
optional additions that never gate basic reading.

The specification lives in [docs/spec](docs/spec/README.md); progress against it
is tracked in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
Installing Monosai, connecting Anki, and configuring OpenRouter are covered in
[docs/setup.md](docs/setup.md); error codes and their recovery are in
[docs/troubleshooting.md](docs/troubleshooting.md).

## Requirements

- Node.js 24.x (or any version accepted by the pinned Angular CLI)
- npm 11+
- Google Chrome (the only officially supported browser family)

## Getting started

```bash
npm ci
npm start
```

The development server serves the app at <http://localhost:4200/>.

## Everyday commands

| Command | Purpose |
| --- | --- |
| `npm start` | Development server |
| `npm run build` | Production build |
| `npm run build:pages` | Production build for the GitHub Pages base path |
| `npm test` | Unit, component, and integration tests |
| `npm run test:coverage` | Tests with coverage |
| `npm run lint` | ESLint, including architectural import boundaries |
| `npm run typecheck` | TypeScript project build |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run e2e` | Playwright desktop and Android projects |
| `npm run e2e:pwa` | Playwright against the production build (installability, offline reload, base path) |
| `npm run assets:verify` | Language dataset schemas, digests, and attribution (offline) |
| `npm run assets:build` | Rebuild the language bundle from pinned sources (needs network) |
| `npm run icons:build` | Rasterize `data/brand/monosai-mark.svg` into the app icons |
| `npm run icons:verify` | Check icon structure, dimensions, and source digest (offline) |
| `npm run verify-dist` | Check a `pages` build's base path, manifest, and icon references |
| `npm run report-bundle` / `report-bundle:check` | Initial vs lazy bundle size report, optionally gated on `bundle-budgets.json` |
| `npm run licenses:build` / `licenses:check` | Regenerate/verify `docs/third-party-licenses.md` from production dependencies |
| `npm run serve-dist` | Serve a `pages` build at `/monosai/` (needed to exercise the service worker locally) |
| `npm run verify` | Format check, lint, typecheck, asset check, tests, production build |

## Architecture

```text
presentation (features, shared-ui, core layout)
      -> application use cases
            -> domain (types, invariants, ports)
      infrastructure implements domain ports
```

- `src/app/domain` — types, invariants, and ports; imports nothing else.
- `src/app/application` — use cases and state machines.
- `src/app/infrastructure` — Dexie, workers, providers, hashing, PWA.
- `src/app/features` — screens; they never import infrastructure directly.
- `src/app/core` — bootstrap, routing, layout, platform facades, diagnostics.
- `src/app/shared-ui` — bounded reusable presentation primitives.
- `src/workers` — worker entry points and their implementations.

Layer rules are enforced by ESLint (`import/no-restricted-paths`,
`import/no-cycle`). Architectural decisions are recorded in
[docs/decisions](docs/decisions).

## Language assets

Japanese analysis needs an offline bundle: the tokenizer runtime, a compact
Japanese-English dictionary, the grammar catalog, and the structural baseline.
They live under `public/assets/language/<version>/` next to a `manifest.json`
that records each file's size, SHA-256 digest, licence, and attribution.

- Preparation starts automatically once startup succeeds, and is never awaited,
  so navigation and reading are available while the bundle downloads. Each file
  is verified against its digest before use and then cached under its immutable
  versioned URL. Settings reports progress and offers a retry after a failure.
- `npm run assets:build` regenerates everything from the pinned sources in
  `scripts/assets/sources.json` and the reviewed datasets in `data/language/`.
  It needs network access and is the only thing that writes the bundle.
- `npm run assets:verify` re-checks the committed bundle without network access
  and runs in CI.
- The tokenizer runtime is not committed: it ships from the locked npm package
  and the Angular builder copies it into the versioned asset directory.

Dataset choices, the gates they pass, and the rejected alternatives are recorded
in [docs/decisions](docs/decisions).

## Progressive Web App

Monosai installs, reloads and reads offline, and offers updates without ever
seizing control mid-form or mid-job — see [docs/setup.md](docs/setup.md) for
the user-facing installation and offline guide, and
[ADR 0027](docs/decisions/0027-pwa-caching-and-update-activation.md) for why
the language bundle stays outside the service worker's own caching and why
activation is user-driven. The brand mark
(`data/brand/monosai-mark.svg`) and app icons are generated reproducibly with
`npm run icons:build` using the Chromium already installed for Playwright, so
no design tool or new dependency is required to regenerate them.

## Deployment

`.github/workflows/ci.yml` runs the quality gates on every push and pull
request, including a production build's dist verification, a bundle size
report, and a second Playwright suite (`e2e-pwa`) that exercises the service
worker against that build. `.github/workflows/deploy.yml` publishes to GitHub
Pages only after CI succeeds on `main`, using the `/monosai/` base path and a
hash-routed SPA fallback.
