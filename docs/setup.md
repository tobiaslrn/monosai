# Setup

A user-facing guide to installing Monosai, connecting Anki, configuring
OpenRouter, and understanding what works offline. For error codes and their
recovery, see [troubleshooting.md](troubleshooting.md). For which combinations
have actually been observed rather than assumed, see
[compatibility-matrix.md](compatibility-matrix.md).

## Installing Monosai

Monosai is a Progressive Web App served from GitHub Pages at
`https://<owner>.github.io/monosai/`. No app store, no account, and no data
leaves the device except the requests you configure yourself (OpenRouter, and
an AnkiConnect endpoint you point at).

1. Open the deployed URL in Chrome (the only officially supported browser
   family).
2. Chrome shows an install affordance once the page qualifies — an icon in the
   address bar, or `⋮ → Install Monosai…`. If neither appears, open Settings
   in the app and use **Install Monosai** under the **App** section; it uses
   the same browser prompt.
3. Installed, Monosai launches in its own window at the same `/monosai/`
   address, with the open-book icon and no browser chrome.

If Chrome's DevTools → Application → Manifest panel reports errors, the
deployed build is broken in a way this guide cannot fix from the browser side —
see the compatibility matrix's open items.

### Updates

Monosai checks for a new version shortly after startup, again whenever the tab
becomes visible, and periodically while it stays open. When one has finished
downloading, a banner appears at the top of the app (not inside the reader,
which stays free of chrome — open Settings to reach the same update state
there). The banner's **Update and reload** button is disabled, with an
explanation, while an unsaved import draft or a running generation,
translation, or audio job would be interrupted; it re-enables once that work
finishes or is dismissed. Activating performs a full reload — Monosai never
seizes control of a page you are in the middle of using.

## Desktop Anki (AnkiConnect)

Monosai reads your reviewed vocabulary from a running Anki installation
through [AnkiConnect](https://foosoft.net/projects/anki-connect/), read-only.
It never writes to your collection.

1. Install Anki and the AnkiConnect add-on (code `2055492159`), then restart
   Anki.
2. **The gate that actually matters:** AnkiConnect only accepts requests from
   origins listed in its `webCorsOriginList` config. A page served from
   `http://localhost` or `http://127.0.0.1` (a local dev server) is exempt by
   AnkiConnect's own default. A page served from anywhere else — including
   `https://<owner>.github.io` — is not, and must be added explicitly. In
   Anki: `Tools → Add-ons → AnkiConnect → Config`, then add your page's exact
   origin to `webCorsOriginList`:

   ```json
   {
     "webCorsOriginList": ["http://localhost", "https://<owner>.github.io"]
   }
   ```

   Restart Anki after editing the config.
3. In Monosai, open **Vocabulary → Anki connection** and test the connection.
   A successful test lists your decks and note types; choose the ones that
   hold your reviewed vocabulary.

If the test fails, the error names which of these it was —
[troubleshooting.md](troubleshooting.md) lists Anki's codes and what each one
means. `anki/origin-not-allowed` is the one this config step exists to
prevent.

## Android bridge

On Android, Monosai speaks the same read-only AnkiConnect protocol to a bridge
app running alongside AnkiDroid, rather than to desktop Anki. Install and
configure that bridge outside Monosai; once it is answering on the device,
the connection test in Vocabulary behaves identically to the desktop case.

## The package fallback

Without a live Anki connection — a different device, a bridge that will not
cooperate, or simply not wanting to keep Anki open — export a package
(`.apkg` or `.colpkg`) from Anki (`File → Export`, "Include scheduling
information" checked) and open it from **Vocabulary → Import a package**
instead. Monosai reads the package fully offline; nothing is uploaded. A
package without scheduling information cannot tell Monosai which cards you
have actually reviewed, so export with it included.

## OpenRouter (optional)

Story generation, translation, grammar review, and text-to-speech are
optional and never gate reading, importing, or vocabulary. They use your own
[OpenRouter](https://openrouter.ai/) account and API key, billed to you
directly; Monosai never sees or stores your key anywhere but this browser's
local storage on this device.

1. Create an OpenRouter account and an API key.
2. In Settings → **AI text features**, paste the key and save it. It is never
   shown again after saving.
3. Paste the exact model ID from OpenRouter's models page (case-sensitive,
   `vendor/model-name`) and run **Test configuration**. The test spends a
   small number of tokens and writes nothing to your library.
4. Voice, under **Voice (optional)**, is configured and tested the
   same way with its own model and voice ID.

A failed test never affects reading, importing, or anything already saved —
see [troubleshooting.md](troubleshooting.md) for what each `ai/*` code means.

## What works offline, and what does not

Once Monosai has been opened online at least once (so the service worker and
the language bundle have installed), offline supports:

- Opening the library and any previously opened reading, including its
  furigana, token analysis, dictionary glosses, and vocabulary markers.
- Any translation, grammar review, or audio clip already generated and
  cached for a reading.
- Importing and reading new plain text — Japanese analysis runs entirely
  on-device.

Offline does **not** support anything that requires OpenRouter or a live Anki
connection: story generation, new translation or grammar review, new
text-to-speech audio, or refreshing your vocabulary from AnkiConnect. The
package import path for vocabulary works offline, since it never leaves the
device.

## Storage and reset

Settings → **Storage** reports whether the browser has granted persistent
storage (durable across low-space eviction) and lets you request it, shows
approximate usage, and offers a full reset that deletes every reading,
snapshot, setting, and cached aid on this device. A reset needs two explicit
confirmations and cannot be undone.
