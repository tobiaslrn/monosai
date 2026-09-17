<div align="center">
  <img src="web/public/icons/icon-512.png" alt="Monosai logo" width="128" height="128" />
  <h1>Monosai</h1>
  <p><b>Japanese reading practice built from the words you already know.</b></p>
  <p>
    <a href="https://tobiaslrn.github.io/monosai/"><b>Open Monosai</b></a> ·
    <a href="https://tobiaslrn.github.io/monosai/#/help">Guide</a> ·
    <a href="docs/setup.md">Setup</a> ·
    <a href="docs/troubleshooting.md">Error codes</a> ·
    <a href="docs/arc42/README.md">Architecture</a>
  </p>
</div>

> [!WARNING]
> Monosai is in alpha. Expect bugs, missing features, and changes while it is being built.

## The problem it solves

Beginners are told to read, and then discover there is nothing to read. Native
material has ten unknown words in the first paragraph, so you look one up every
few seconds, and by the end of the page you have practised using a dictionary
rather than reading Japanese.

Monosai writes short stories that stay inside the vocabulary you have already
studied. It takes the words from cards you have actually reviewed in Anki, and
from about 50 words upwards it can write something you can read straight
through. Any word it could not avoid is marked, so you always know where you
stand.

That is the point of the whole application: **reading practice with no lookups**,
at the level you are actually at.

## What it is not for

Monosai is for the first few months, and it is built to be outgrown. Stories
written by a model are scaffolding. Nobody actually wants to read generated
fiction, and this project is not trying to produce good literature. It exists so
you can practise reading sentences instead of decoding them.

Once you can get through a page of real Japanese with a dictionary and some
patience, move on to material written by people. Getting you to that point
sooner is the only goal here.

Also out of scope: scheduling reviews, editing your cards, other languages,
other flashcard applications, and anything that would make Monosai a place you
are supposed to stay.

## What you can do

The main path:

- Connect Anki, or import an export, or paste a list, to tell Monosai which
  words you know.
- Pick a grammar level, write a premise, and generate a story inside those words.
- Read it with hiragana above the kanji, spacing between words, and a dictionary
  one tap away.
- Have any sentence translated or explained, on request.
- Generate audio and listen while you read.

The reader also works on its own, without any AI:

- Paste Japanese from anywhere and read it with the same readings, spacing, and
  markers for words you probably do not know yet.
- Look words up locally, offline, at no cost.

This half is genuinely useful, but it is the smaller half. Plenty of tools add
furigana to a text. Far fewer give you a text you can already read.

## What you need

| For | You need |
| --- | --- |
| Reading text you paste | A browser. Nothing else |
| Knowing which words you know | Anki, or a list you paste yourself |
| Generating stories, translation, grammar notes, audio | An [OpenRouter](https://openrouter.ai/) account and API key |

Monosai has no AI of its own and no shared key. You pay OpenRouter directly for
what you use, and your key stays in your browser on your device. On a sensible
model a generated story costs a fraction of a cent.

## Getting started

1. Open [Monosai](https://tobiaslrn.github.io/monosai/).
2. Add a word source under **What you can read**, and choose a grammar level.
3. Paste an OpenRouter key in **Settings**, choose a text model, and test it.
4. Generate a story.

The [in-app guide](https://tobiaslrn.github.io/monosai/#/help) walks through
each step and is the place where the detailed advice lives. It works offline and
needs no key to read.

## Your vocabulary comes from Anki

Anki knows which cards you have actually reviewed, which is the only honest
record of what you know. Monosai reads that and nothing else. It never writes to
your collection: the code that talks to Anki has no write operation in it.

There are three ways in:

- **Anki on a computer**, through the AnkiConnect add-on. One config line is
  needed so AnkiConnect answers the page. See
  [the setup guide](docs/setup.md#desktop-anki-ankiconnect).
- **AnkiDroid on Android**, through the [Monosai Bridge](android-bridge/README.md),
  a small companion app you install from the
  [releases page](https://github.com/tobiaslrn/monosai/releases?q=bridge-v). A
  browser cannot read another app's data, so live access on a phone needs a
  native app in between. Being installed outside the Play Store, it may draw a
  Play Protect warning and an install permission prompt, and AnkiDroid's own
  permission is worded as read and write because it has no read-only option.
  The bridge only reads.
- **An export file** (`.apkg` or `.colpkg`), read entirely on your device. The
  simplest option, and the only one on an iPhone, where no app can read
  AnkiMobile's collection.

## Choosing models

Model choice decides both quality and cost, and the useful range is narrower
than it looks. Very small models invent words that do not exist, get particles
and conjugation wrong, and ignore your vocabulary list. Flagship models write
excellent Japanese and are a waste of money for deliberately simple text, where
a single story can cost tens of cents. Mid-size models are the sweet spot.

As of September 2026, the two worth starting from:

- `google/gemini-3.8-flash` for the best stories, at a few cents each.
- `z-ai/glm-5.3-flash` for roughly a tenth of that price and quality that holds
  up well in daily use.

For speech there are two different approaches: an instruction-following model
such as `google/gemini-3.1-flash-tts-preview`, which reads with real intonation
and takes a style description but costs around 20 cents for a 50-sentence story,
or a small dedicated model such as `hexgrad/kokoro-82m`, which is plainer and
costs well under a cent.

Every model responds to the same prompt differently, so it is worth trying a few
with the same premise. The
[model guide](https://tobiaslrn.github.io/monosai/#/help/text-models) and the
[voice guide](https://tobiaslrn.github.io/monosai/#/help/voice) in the app go
into this properly, including reasoning effort and how to watch what you spend.

OpenRouter is the only supported service. One key reaching every model is what
makes comparing and switching practical. Local models and other endpoints are
not supported today.

## Install it, or just use the tab

Monosai is a Progressive Web App. There is no store listing and no download:
open it in Chrome and use the install entry in the address bar, the browser
menu, or **Settings → About**. Installed, it gets its own window and icon, and
on Android it behaves like a normal app and can receive an Anki export from
AnkiDroid's share sheet.

Everything works in an ordinary tab as well. Installing changes how it feels,
not what it does.

Open Monosai online once and after that your library, the dictionary, and
importing new text work offline. Anything that leaves the device, meaning
generation, new translations, new audio, and refreshing from a running Anki,
needs a connection.

## Your data

Everything stays on your device: stories, words, settings, and audio, in this
browser, with no account and no server to sync with. Monosai collects no
analytics.

What leaves your device is only what a request needs: your premise, the words
you know, and the sentence being translated or spoken. Your API key goes to
OpenRouter and nowhere else, and never appears in a log or a diagnostic export.

## Documentation

- [In-app guide](https://tobiaslrn.github.io/monosai/#/help) for using Monosai.
- [docs/](docs/) for everything else: the
  [setup reference](docs/setup.md), the [error codes](docs/troubleshooting.md),
  the [architecture](docs/arc42/README.md), the [decisions](docs/decisions/),
  and the [design system](docs/design-system.md).
- [AGENTS.md](AGENTS.md) for contributing conventions.

## License

Monosai is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not permitted
without a separate license from the licensor.
