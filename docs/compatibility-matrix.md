# Manual external compatibility matrix

The matrix `testing-and-delivery.md` §11 requires: version/date/result for
each real external combination, recorded honestly rather than assumed. Rows
this machine cannot exercise are marked **Open** rather than claimed.

| Combination | Version / date | Result | Notes |
| --- | --- | --- | --- |
| Windows Chrome + desktop Anki + AnkiConnect | AnkiConnect `2055492159`, Anki 25.x, Chrome (desktop), measured during Milestone 5 | **Partial** | HTTP-level measurement plus one real run from `http://127.0.0.1:4200` connected and listed a real collection (10 decks, 24 note types). See [ADR 0017](decisions/0017-anki-connect-origin-policy.md). A deployed **HTTPS** page (`https://<owner>.github.io/monosai/`) reaching `127.0.0.1` in a real Chrome profile has not been observed — Chrome gates some private-network behaviour on secure contexts, and this may differ from the loopback case tested. |
| Android Chrome (Android 12 minimum + a current version) + AnkiConnect-compatible bridge | — | **Open** | The Android bridge path has been exercised against a fake provider and the shared contract test only, never a real device. No Android hardware or emulator with a real bridge app was available at implementation time. |
| Package export from desktop Anki | Synthetic fixtures built by `scripts/fixtures/build-anki-fixtures.mjs` (schema 11, schema 18, legacy stub, missing-`reps`-column variants) | **Partial** | Fixture-level coverage is thorough — every fixture is synthetic and licence-safe per the testing specification, covering the schema variance Anki has shipped across versions. A real `.apkg`/`.colpkg` exported from a real current Anki Desktop installation has not been run through the importer. |
| Package export and Android share target from AnkiDroid | Synthetic schema fixtures and local production-PWA multipart POST, 2026-08-27 | **Partial** | The live service worker receives a browser form POST, redirects inside the Pages base path, imports and replaces the package offline, and cleans its Cache Storage inbox in `e2e-pwa/pwa.spec.ts`. No real `.apkg`/`.colpkg`, Android share sheet, or installed-PWA manifest registration has been exercised on physical Android hardware, so that verification remains open. |
| Three OpenRouter text-model families on the fixed prompt corpus | — | **Open** | `scripts/evals/prompt-corpus.json` fixes the six-profile, register, long-form, adversarial, translation, grammar, exception, malformed-response, and repair cases plus the adoption scorecard. No live key was available to run the required three configurable model families. Every hard constraint is covered locally, but comparative narrative quality still needs the documented blind manual run. |
| A compatible OpenRouter TTS model/voice, including contextual instructions | — | **Open** | The request contract, supported path, rejection fallback, target-only `input`, 200-code-point context cap, and context-sensitive cache keys are fixture-tested. No real audio has come back from a live provider, and the required human A/B review of naturalness and contextual intonation has not been performed. |
| PWA install, offline reload, and update prompt against the **deployed** Pages URL | — | **Open** | `e2e-pwa/pwa.spec.ts` exercises installability, the base path, and offline reload against a locally served production build (`scripts/serve-dist.mjs`), which is the closest verification possible without a merge and a live deploy. The identical checks against the actual `https://<owner>.github.io/monosai/` URL — including a real Chrome install prompt and DevTools' own installability judgement — have not been run. |
| Installed Android PWA background audio and lock-screen controls | Automated MediaSource, WAV sequence, playback-store, and Media Session contract tests, 2026-08-28 | **Partial** | Complete readings now play as one native media resource with Play, Pause, Stop, sentence navigation, seeking, position, metadata, and artwork published to Media Session. No physical Android device has yet verified uninterrupted playback across sentence boundaries with the screen locked, app switching, notification controls, or headset buttons. See [ADR 0039](decisions/0039-continuous-android-audio.md). |
| Manual screen-reader pass | — | **Open** | `testing-and-delivery.md` §6 also requires a manual screen-reader pass (NVDA/VoiceOver or equivalent) alongside the automated axe scans that do run in CI. Not performed; automated accessibility coverage (axe, the token-contrast check, reduced-motion guards) is not a substitute for it. |

## What *is* covered without a live external service

Per `testing-and-delivery.md` §1, the ordinary CI suite represents OpenRouter
and Anki with controllable fakes rather than live services, so none of the
gaps above block CI — they are specifically the checks that need a human, a
real account, or real hardware, and are why this matrix exists.

- `npm run e2e` and `npm run e2e:pwa` run in CI on every push and pull
  request against the fake providers and the local production build.
- `npm audit --omit=dev`, `npm run licenses:check`, `npm run icons:verify`,
  and `npm run verify-dist` gate CI independent of any external service.
- The full Playwright PWA suite (installability, base path, offline reload)
  passes locally against `scripts/serve-dist.mjs`; see
  [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)'s Milestone 10 section
  for the exact run.

## Updating this matrix

Replace an **Open** row's result once the combination has actually been
exercised, recording the real version/date and what was observed — not what
was expected. A row that has not been run stays **Open** rather than being
marked done on the strength of the code alone.
