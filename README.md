<div align="center">
  <img src="web/public/icons/icon-512.png" alt="Monosai logo" width="128" height="128" />
  <h1>Monosai</h1>
  <p>
    <a href="https://tobiaslrn.github.io/monosai/"><b>Open Monosai</b></a> ·
    <a href="docs/setup.md">Setup guide</a> ·
    <a href="docs/troubleshooting.md">Help</a> ·
    <a href="docs/arc42/README.md">Architecture</a>
  </p>
</div>

> [!WARNING]
> Monosai is currently in alpha. Expect bugs, missing features, and changes while it is being built.

## Why this exists

Monosai is for the very beginning of learning Japanese, when you barely know
any words but still want to practice reading. I built it while studying a
frequency deck because I could not find suitable reading material. Monosai can
generate very simple stories from your reviewed Anki vocabulary and chosen
grammar level, starting from about 50 known expressions.

You can also paste any Japanese text. Monosai adds
hiragana readings, word spacing, unfamiliar-word highlights and a built-in
dictionary.

## What you can do

- Paste Japanese text.
- See hiragana readings above kanji, clear word spacing and highlights for
  unfamiliar vocabulary and grammar.
- Look up words in the built-in dictionary without leaving the story.
- Save stories and continue later.
- Use Anki as a vocabulary source and see which words are still unknown.
- Translate individual sentences with optional AI.
- Generate Japanese audio and listen with the built-in audio player.
- Create very simple stories from about 50 reviewed expressions.
- Install Monosai like a normal app on your computer or Android device.

## Use your Anki vocabulary

Monosai uses the words you have reviewed in Anki as your vocabulary source. It
marks words you may not know and keeps generated stories within your known
vocabulary, apart from the basic Japanese needed to form sentences.

Monosai only reads from Anki. It never changes your cards or study history.

There are two ways to add your vocabulary:

- Connect to Anki on your computer with the AnkiConnect add-on. On Android,
  you can use a compatible bridge for AnkiDroid.
- Export an `.apkg` or `.colpkg` file from Anki and open it in Monosai. The
  file is read on your device and is not uploaded.

The [setup guide](docs/setup.md) explains both options step by step.

## What is free, and what needs your key

Monosai has two halves, and it is worth knowing which is which before you
start. The left column works the moment you open the page, with no account and
no connection once the app has loaded. The right column sends a request to
OpenRouter and is billed to your account.

| Local and free | Needs your OpenRouter key |
| --- | --- |
| The reader, hiragana readings, and word spacing | Writing a story with AI |
| Dictionary lookup and word forms | Translation into English |
| Anki import, word lists, and your reading level | Grammar notes |
| Saved stories, and reading them offline | Text-to-speech audio |

In the application, everything in the right column is marked with a sparkle.
Nothing without that mark ever sends a request.

Monosai is strictly **bring your own key**. For now, OpenRouter is the only
supported AI service. Add your own OpenRouter API key and model choices in
**Settings**. You pay OpenRouter directly for what you use; Monosai does not
provide a shared key or include AI credits.

Your API key is saved only in this browser on this device. AI features need an
internet connection. Stories are written from at least 50 reviewed expressions.

## Install Monosai

Monosai is a Progressive Web App (PWA). This means you can install it straight
from Chrome. There is no app store download.

1. Open [Monosai](https://tobiaslrn.github.io/monosai/) in Chrome.
2. Open **Settings** in Monosai and choose **Install Monosai**. You can also
   use Chrome's install button in the address bar or browser menu.
3. Accept the install prompt. Monosai will then open in its own window and can
   be added to your home screen or app list.

Open Monosai online once before using it offline. Saved stories, dictionary
help and new text imports work without a connection. New AI requests and a
live Anki connection still need a connection.

If something does not work, see the [troubleshooting guide](docs/troubleshooting.md).

## License

Monosai is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not
permitted without a separate license from the licensor.
