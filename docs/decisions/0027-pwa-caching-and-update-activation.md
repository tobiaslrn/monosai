# 0027 — PWA caching boundaries and update activation

Date: 2026-08-21
Status: Accepted

## Context

Milestone 10 wired the Angular service worker (`ngsw-config.json`), app
icons, and the update/install surfaces (`AppUpdateStore`,
`InstallPromptService`). Three decisions in that work are load-bearing enough
to record rather than leave implicit in the config and the code.

### The language bundle must not be a `ngsw-config.json` asset group

The tokenizer WebAssembly module and `sql-wasm.wasm` are large
(`lindera_wasm_bg.wasm` and `sql-wasm.wasm`, copied into
`assets/language/1/tokenizer` and `assets/sqlite` by `angular.json`'s asset
config), and the language bundle already has its own cache: `LanguageAssetSource`
verifies every file's SHA-256 digest against `manifest.json` before use and
caches it under an immutable versioned URL (`monosai-language-<version>`),
per the lineage in
[language-asset-cache.ts](../../web/src/app/infrastructure/language/language-asset-cache.ts).

Two reasons both had to hold before excluding `/assets/language/**` and
`/assets/sqlite/**` from the generic `assets` group in `ngsw-config.json`:

- **Install-time cost.** The `assets` group's `installMode: "lazy"` still
  means every *update* to the app fetches changed files under
  `updateMode: "prefetch"`. A 13 MB tokenizer and a multi-megabyte SQLite
  WASM build sitting in that group would be re-downloaded on every app update
  that touched any matching file, regardless of whether the language bundle
  itself changed.
- **Source-of-truth duplication.** The point of the digest-verified,
  version-immutable cache is that Monosai's own code decides when a bundle is
  valid and when to re-fetch it. A second cache (the service worker's) holding
  the same bytes under a different key would let the two disagree about
  whether a given version is current, and doubles the storage for no benefit.

### Update activation is user-driven and refused while busy

`provideServiceWorker` uses `registerWhenStable:30000` deliberately — the
comment predates this milestone — because Monosai's workflows are exactly the
ones a mid-flight service-worker takeover would corrupt: an unsaved import
draft, a story generation run that writes nothing until its final
transaction, a translation or audio job that batches and cancels carefully.
`AppUpdateStore.activate()` extends that principle from *registration* to
*activation*: it refuses outright while `AppBusyRegistry.isBusy()`, and the
banner disables its action with an explanation rather than hiding the update
or activating anyway. `AppBusyRegistry` is a generic signal-backed set of
reasons — not a direct dependency between the update store and each busy
feature — so `GenerationStore`, `TranslationJobStore`, `AudioJobStore`, and
`ImportStore` each register their own busy state independently, and none of
them needs to know the update system exists.

The alternative — activating immediately once a version is ready — is what
`SwUpdate` does by default if nothing intervenes, and is exactly the
"reload seizes control mid-form" failure mode the milestone's acceptance
criteria (`testing-and-delivery.md` §10) name explicitly.

### Icons are verified structurally, not by digest

`web/scripts/icons/build-icons.mjs` rasterises `web/data/brand/monosai-mark.svg`
using the Chromium already installed for Playwright. Chromium's PNG encoder
is not guaranteed byte-identical across platforms, versions, or even repeated
runs on the same machine — unlike the language bundle's source files, which
are fetched bytes with a canonical digest to verify against.
`web/scripts/icons/verify-icons.mjs` therefore checks what actually matters for
correctness — every declared file exists, is a real PNG (signature + IHDR),
has exactly the declared pixel dimensions, and is non-trivially sized — and
separately checks that the *source* SVG has not drifted from what was last
built, via a digest recorded in `web/scripts/icons/icons.lock.json` by the build
script. A CI run on Linux against icons built on Windows would fail a
byte-equality check for a reason that has nothing to do with whether the
icons are correct; it does not fail this one.

## Decision

- `ngsw-config.json`'s `assets` group excludes `/assets/language/**` and
  `/assets/sqlite/**`; the language bundle stays owned entirely by
  `LanguageAssetSource`'s own cache.
- `AppUpdateStore.activate()` and `reloadNow()` both refuse while
  `AppBusyRegistry.isBusy()`, and the update banner reflects that refusal
  visibly rather than silently declining the click.
- `icons:verify` asserts PNG structure, exact dimensions, and the source
  SVG's digest — never pixel-for-pixel or byte-for-byte equality against a
  previously generated PNG.

## Consequences

- An app update never re-downloads the language bundle, and the language
  bundle's digest verification remains the single source of truth for
  whether it needs re-fetching.
- A learner mid-import, mid-generation, or mid-job always finishes that work
  before an available update can seize the page; the trade-off is that an
  update can sit available-but-inactive for as long as that work continues,
  which is the correct trade-off for an application whose writes are
  transactional and whose provider calls are billed.
- Icon verification cannot catch a rasterisation regression that changes
  pixels while keeping dimensions and file validity intact (e.g. the mark
  rendering with wrong colours). That class of regression needs the browser
  verification step in the milestone's own checklist — DevTools →
  Application → Manifest showing all four icons, checked by eye — not an
  automated gate.
