# Manual external compatibility matrix

The matrix `testing-and-delivery.md` §11 requires: version/date/result for
each real external combination, recorded honestly rather than assumed. Rows
this machine cannot exercise are marked **Open** rather than claimed.

| Combination | Version / date | Result | Notes |
| --- | --- | --- | --- |
| Windows Chrome + desktop Anki + AnkiConnect | AnkiConnect `2055492159`, Anki 25.x, Chrome (desktop), measured during Milestone 5 | **Partial** | HTTP-level measurement plus one real run from `http://127.0.0.1:4200` connected and listed a real collection (10 decks, 24 note types). See [ADR 0017](decisions/0017-anki-connect-origin-policy.md). A deployed **HTTPS** page (`https://<owner>.github.io/monosai/`) reaching `127.0.0.1` in a real Chrome profile has not been observed — Chrome gates some private-network behaviour on secure contexts, and this may differ from the loopback case tested. |
| Android Chrome (Android 12 minimum + a current version) + AnkiConnect-compatible bridge | — | **Open** | The Android bridge path has been exercised against a fake provider and the shared contract test only, never a real device. No Android hardware or emulator with a real bridge app was available at implementation time. |
| Package export from desktop Anki | Synthetic fixtures built by `scripts/fixtures/build-anki-fixtures.mjs` (schema 11, schema 18, legacy stub, missing-`reps`-column variants) | **Partial** | Fixture-level coverage is thorough — every fixture is synthetic and licence-safe per the testing specification, covering the schema variance Anki has shipped across versions. A real `.apkg`/`.colpkg` exported from a real current Anki Desktop installation has not been run through the importer. |
| Package export from AnkiDroid | — | **Open** | No `.apkg`/`.colpkg` exported from a real AnkiDroid installation has been tested. AnkiDroid's export format is assumed compatible with desktop Anki's (both are SQLite collections in the same zip container), consistent with the fixtures above, but this is an assumption, not a measurement. |
| A compatible OpenRouter text model | — | **Open** | No live OpenRouter API key was available at implementation time. Every layer down to the HTTP client is covered by fixtures and a routed fake provider; the full round trip against the real OpenRouter API — a real model answering a real structured-output request — is untested. Carried from Milestones 6 and 7. |
| A compatible OpenRouter TTS model/voice | — | **Open** | Same gap as above, for text-to-speech: the fake provider and adapter fixtures over a routed stub are covered, but no real audio has come back from a real provider. Carried from Milestone 9. |
| PWA install, offline reload, and update prompt against the **deployed** Pages URL | — | **Open** | `e2e-pwa/pwa.spec.ts` exercises installability, the base path, and offline reload against a locally served production build (`scripts/serve-dist.mjs`), which is the closest verification possible without a merge and a live deploy. The identical checks against the actual `https://<owner>.github.io/monosai/` URL — including a real Chrome install prompt and DevTools' own installability judgement — have not been run. |
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
