<div align="center">
  <img src="web/public/icons/icon-512.png" alt="Monosai logo" width="128" height="128" />
  <h1>Monosai</h1>
  <p><b>Japanese reading practice built from the words you already know.</b></p>
  <p>
    <a href="https://tobiaslrn.github.io/monosai/"><b>Open Monosai</b></a> ·
    <a href="https://tobiaslrn.github.io/monosai/#/help">Guide</a> ·
    <a href="https://github.com/tobiaslrn/monosai/releases?q=bridge-v">Android bridge APK</a> ·
    <a href="https://github.com/tobiaslrn/monosai/issues">Issues</a>
  </p>
</div>

> [!WARNING]
> Monosai is in alpha. Expect bugs, missing features, and changes while it is being built.

Monosai is a reading app for beginners in Japanese. You paste your own text, or
generate a story that stays inside the vocabulary you have already studied, and
either way you land in the same reader: word spacing, furigana, dictionary
lookup, and a mark on every word you have probably not met. Translation, grammar
notes, and speech are optional extras that cost money. Vocabulary comes from the
cards you have reviewed in Anki, or from a list you paste.

It is a local-first Angular PWA with no backend. Stories, vocabulary, settings,
and audio live in IndexedDB on the device. The reader, the dictionary, and Anki
package parsing all run in the browser; only generation and the optional aids
touch the network, through the user's own OpenRouter key.

This README is for people working on the code. To use the app, start with the
[in-app guide](https://tobiaslrn.github.io/monosai/#/help).

## How it works

- **The reader** is the centre. Import needs no key, no account, and no network:
  tokenisation, readings, and dictionary lookup run on the device in workers,
  over a Lindera WASM build and a bundled language dataset.
- **Vocabulary** comes from AnkiConnect on desktop, the Android bridge on a
  phone, an `.apkg`/`.colpkg` export, or a pasted list. Anki access is read-only,
  enforced by a typed action allowlist: sending anything outside it is a compile
  error, not something review has to catch.
- **Generation** calls OpenRouter from the browser with the user's own key, so
  there is no server and no shared key. Monosai checks the result against the
  vocabulary snapshot, spends a repair budget on words outside it, and marks what
  it could not fix.
- **Enrichment and audio** (translation, grammar notes, speech) are separate
  optional passes over a saved story, cached locally once fetched.
- **Persistence** is Dexie over IndexedDB. Committed schema versions are
  immutable; changes ship as a new version with a transactional upgrade.
- **The bridge** is a separate Android app with its own release cycle. It and the
  web app negotiate a single contract integer in `protocol/contract.txt` instead
  of pinning versions to each other.

## Stack

Angular 22, TypeScript 6, Dexie 4 over IndexedDB, Zod 4 for runtime validation,
sql.js and `lindera-wasm-web-ipadic` in workers, `@openrouter/sdk`. Vitest for
unit tests, Playwright for E2E. The bridge is Kotlin and Gradle.

## Repository layout

| Path | Contents |
| --- | --- |
| [`web/`](web/) | The Angular application, its tests, its E2E suites, and its build scripts |
| [`android-bridge/`](android-bridge/README.md) | The AnkiDroid companion app |
| [`protocol/`](protocol/) | The bridge contract both sides read |
| [`scripts/`](scripts/) | Bridge release, decision-index, and licence tooling |
| [`docs/`](docs/) | Architecture, decisions, design system, setup, error codes |
| [`.github/`](.github/workflows/) | CI and the bridge release workflow |

## Development

Node is pinned in [`.nvmrc`](.nvmrc). Dependencies live in `web/`.

```bash
npm ci --prefix web
npm start                    # dev server on http://localhost:4200
```

| Command | What it does |
| --- | --- |
| `npm test` | Vitest suite. One file: `npm test -- --include src/app/…/x.spec.ts` |
| `npm run e2e` | Desktop and Android smoke lane |
| `npm run e2e:full` | Full browser regression |
| `npm run e2e:pwa` | Production build with the service worker live |
| `npm run lint` | ESLint, including the layer-import rules |
| `npm run stylelint` | Component style rules, a separate CI gate from `lint` |
| `npm run typecheck` | App and E2E type checks |
| `npm run format` | Prettier over the repo (`format:check` to verify only) |
| `npm run build:pages` | The Pages build everything downstream consumes |
| `npm run verify` | Static analysis, coverage, build, and the bridge gate |

`npm run verify` covers CI's non-browser gates. It does not run `e2e` or
`e2e:pwa`, which also block merging, and it includes `bridge:verify`, which needs
the Android SDK and Java 21. Without those, run the web gates individually.

CI runs static analysis, unit tests with coverage, one application build, three
sharded browser jobs, the PWA suite, and the bridge gate. Pull requests run the
`@smoke` lane; pushes to `main` run the full browser regression. Everything after
`build` consumes that one artifact, so the deployed bytes are the tested bytes.

## Contributing

[AGENTS.md](AGENTS.md) is the working agreement: architecture rules, testing
expectations, commit format, and how to verify a change. Read it before opening a
pull request. Commits follow Conventional Commits with a required scope.

## Documentation

[docs/README.md](docs/README.md) indexes everything, split by audience. The ones
worth knowing by name: [architecture](docs/arc42/README.md) for the system as it
is, [decisions](docs/decisions/) for why, and the
[design system](docs/design-system.md) for anything visual.

## License

Monosai is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not permitted
without a separate license from the licensor.
