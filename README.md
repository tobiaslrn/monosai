<div align="center">
  <img src="data/brand/monosai-mark.svg" alt="Monosai Logo" width="96" height="96" style="border-radius: 12px;"/>
  <h1>Monosai</h1>
  <p><b>Local-first Japanese reading app with furigana, glosses, and Anki integration</b></p>
  <p>
    <a href="https://<owner>.github.io/monosai/"><b>Launch App</b></a> •
    <a href="docs/setup.md">Setup Guide</a> •
    <a href="docs/troubleshooting.md">Troubleshooting</a>
  </p>
</div>

<hr />

Monosai is a local-first reading app for people learning Japanese. Paste in
some Japanese text, or open a `.txt` file, and Monosai shows it back to you
with furigana, word spacing, part-of-speech hints, and short dictionary
definitions — plus markers for words you already know from Anki.

## What it does

- **Reading helper** — furigana, tokenization, and quick glosses for any
  Japanese text you paste or open.
- **Vocabulary awareness** — connect Anki (read-only) so Monosai can mark
  words you've already learned.
- **Works offline** — install it as an app and keep reading without a
  connection, once the language data is downloaded.
- **Optional extras** — story generation, translation, grammar explanations,
  and audio, powered by OpenRouter if you choose to set it up. None of this
  is required to just read.

## Quick start (using the app)

Monosai is a Progressive Web App, so most people don't need to build
anything — just open it in Chrome:

1. Go to the deployed site (`https://<owner>.github.io/monosai/`).
2. Paste some Japanese text or open a `.txt` file.
3. Optional: install it for offline use. Chrome will offer an "Install"
   button in the address bar, or use **Settings → Install Monosai** inside
   the app.

Want to connect your Anki vocabulary or set up translation/story features?
See the full [setup guide](docs/setup.md) — it walks through Anki, the
Android bridge, and OpenRouter step by step. Running into an error code?
Check [troubleshooting.md](docs/troubleshooting.md).

## Running it yourself / building from source

If you want to run a local copy or contribute to development:

**You'll need:**

- Node.js 24.x
- npm 11+
- Google Chrome (the only browser family we officially support)

**Get it running:**

```bash
npm ci
npm start
```

This starts a dev server at <http://localhost:4200/>.

**Useful commands while developing:**

| Command | What it does |
| --- | --- |
| `npm start` | Run the dev server |
| `npm run build` | Production build |
| `npm run build:pages` | Production build for GitHub Pages |
| `npm test` | Run the test suite |
| `npm run lint` | Lint the code |
| `npm run typecheck` | Check TypeScript types |
| `npm run e2e` | Run end-to-end tests (desktop and Android) |
| `npm run verify` | Run everything: format check, lint, typecheck, tests, build |

There are a few more specialized scripts (rebuilding language data, icons,
license reports, bundle-size checks) — see `package.json` for the full list.
