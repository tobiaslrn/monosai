# Setup

A user-facing guide to installing Monosai, connecting Anki, configuring
OpenRouter, and understanding what works offline. For error codes and their
recovery, see [troubleshooting.md](troubleshooting.md). For which combinations
have actually been observed rather than assumed, see
[risks and technical debt](arc42/11-risks-and-technical-debt.md).

## Your first five minutes

The rest of this guide is organised by subsystem, which is the wrong shape for
the question "I have just opened this, what now?". This section answers that
one; the in-app guide (**Help**) carries the same three steps.

1. Open the deployed URL. You land on the Library, which offers two doors.
2. **Paste Japanese text** — paste a few sentences from anything you want to
   read and save it. Tap a word for its meaning. Nothing is set up, nothing is
   sent anywhere, and this half of Monosai never needs a key.
3. Add a word source under **What you can read**: connect Anki, import an
   `.apkg`, or paste a list. Writing stories needs at least 50 reviewed
   expressions; everything else works with fewer.
4. In **Settings → AI**, add an OpenRouter key, then pick a text model from the
   **Suggested** group and let its test run.
5. **Write with AI**. Until steps 3 and 4 are done, that screen shows the
   remaining setup as a checklist instead of a form, so there is no way to fill
   in a story only to find the button dead.

Steps 3 to 5 are optional. Steps 1 and 2 are the whole application for someone
who only wants to read.

## What is free, and what needs your key

| Local and free | Needs your OpenRouter key |
| --- | --- |
| The reader, hiragana readings, and word spacing | Writing a story with AI |
| Dictionary lookup and word forms | Translation into English |
| Anki import, word lists, and your reading level | Grammar notes |
| Saved stories, and reading them offline | Text-to-speech audio |

In the application, every control in the right column carries a sparkle, and
nothing else does. Anything marked with it sends a request to OpenRouter and is
billed to your account; anything unmarked runs on this device.

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
   address, with the Monosai mascot icon and no browser chrome.

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
3. In Monosai, open **What you can read → Add words → Anki**. Pressing it just
   tries; a successful connection lists your decks and note types, and Monosai
   suggests which field holds the Japanese.

If it cannot connect, the panel names the one thing to fix and prints the code —
[troubleshooting.md](troubleshooting.md) lists Anki's codes and what each one
means. `anki/origin-not-allowed` is the one this config step exists to
prevent. AnkiConnect's port is asked for only there, behind **Different port**,
because it is only ever wrong when a connection has already failed.

## Android bridge

Packages are the recommended simple setup on Android and the only Anki path
on iOS. For optional live access, use Android 16+ and AnkiDroid 2.24+:

1. Install AnkiDroid and the signed Monosai Anki bridge APK from a `bridge-v*`
   [GitHub release](https://github.com/tobiaslrn/monosai/releases?q=bridge-v).
2. Open AnkiDroid with your collection. In the bridge, choose **Grant AnkiDroid
   access**, then **Start bridge**. AnkiDroid calls this database read/write
   access because it has no read-only permission; the bridge only exposes reads.
3. In Monosai, choose **Add words → Anki**. On Android that one entry reaches the
   bridge; there is no separate row to pick, and no port to set.
   Review the suggested deck, note type, Japanese field and words, then confirm.

This is two native installs plus the PWA and a permission grant. Port 8765 is
fixed, independent of the desktop port setting. The Pages origin and
`http://localhost:4200` work by default; other origins can be added in the bridge.
AnkiDroid 2.23 and older cannot supply the required searchable card review data.
An incompatible third-party bridge is reported as unsupported, not as a missing
desktop permission setting.

The bridge stays available without polling or wake locks and can restart after
reboot while enabled. It does not request notification permission, so its service
notification stays out of the drawer; Android still lists it under Active apps.
Force stop and device battery policies can stop it. Open it and press Start if
it stops answering. **Stop bridge** disables automatic restart.

Bridge updates are checked once when you open it. Downloaded APKs must match the
installed signer. Android requires allowing installs from this app and confirming
the update in the system installer; silent installation is not supported. Debug
builds cannot update to release builds signed with a different key. The PWA keeps
its existing service-worker updates independently. See the
[bridge guide](../android-bridge/README.md) for builds and device verification.

## The package fallback

Without a live Anki connection — a different device, a bridge that will not
cooperate, or simply not wanting to keep Anki open — export a package
(`.apkg` or `.colpkg`) from Anki (`File → Export`, "Include scheduling
information" checked) and open it from **What you can read → Add words → A file**
instead. Monosai reads the package fully offline; nothing is uploaded. A
package without scheduling information cannot tell Monosai which cards you
have actually reviewed, so export with it included.

On Android Chrome, install Monosai first, then export a deck from AnkiDroid with
scheduling information and choose Monosai in Android's share sheet. The share
target accepts one `.apkg` or `.colpkg` at a time. A parent-deck export includes
its subdecks. Sharing the same case-sensitive deck name again replaces that
package source; pasted lists and other Anki sources are left alone.

Chrome may need to refresh the installed app's manifest—or the app may need to
be reinstalled—before Monosai appears as a share target after this feature is
deployed. Browsers that do not support file share targets keep the file-picker
workflow above.

## OpenRouter (optional)

Story generation, translation, grammar review, and text-to-speech are
optional and never gate reading, importing, or vocabulary. They use your own
[OpenRouter](https://openrouter.ai/) account and API key, billed to you
directly; Monosai never sees or stores your key anywhere but this browser's
local storage on this device.

1. Create an OpenRouter account and an API key.
2. In Settings → **AI**, open the **OpenRouter key** row, paste the key, and
   choose **Connect**. It is never shown again after saving. Nothing else in the
   section appears until a key is saved, because nothing else works without one.
3. Under **Text**, open the **Model** picker and choose a model. Choosing one
   starts its compatibility test; there is no separate Test button. The test
   spends a small number of tokens and writes nothing to your library.
4. Watch the status beside **Text**. A model that did not pass says so there,
   and that status doubles as the retry.
5. Voice is optional and lives under the same section, with its own picker and
   its own test.

### Which model to choose

This is the decision that most often decides whether generation works at all.
Many models answer an ordinary chat message perfectly well and still fail to
return the structured reply Monosai's generation contract needs, so picking at
random from OpenRouter's several hundred models is close to a coin toss.

The picker leads with a **Suggested** group: a short, curated list of text
models that have answered Monosai's structured-output test, checked against
OpenRouter's live catalogue so a retired identifier stops being offered rather
than failing on the first request. Start there. The group is a starting point,
not a restriction — nothing is hidden, and the whole catalogue stays one search
away below it. Rows whose catalogue entry advertises structured output say so in
their meta line; the absence of that note is not proof a model will fail, only
that OpenRouter does not advertise it.

A model you settle on can be starred, which pins it to a **Favourites** group
above the catalogue and ahead of the suggestions.

Gemini models work through the same OpenRouter configuration. For example, use
an available `google/gemini-*` model ID for text and a model whose ID ends in
`-tts` for voice, such as `google/gemini-3.1-flash-tts-preview`. A specific
Gemini voice is optional;
the dialog offers OpenRouter's advertised voices and defaults to `Kore` when no
voice is selected. Choose a named pace — Natural, Slow, or Very slow — for the
voice model. Instruction-capable models receive that pace as a description;
other models receive a best-effort numeric `speed`, while Gemini receives no
numeric speed. The selected speaking style is available when the model supports
instructions. Reading speed is then fine-tuned locally during playback, with
pitch preservation, so it is consistent across sentences and does not trigger
regeneration. Monosai converts Gemini's PCM response to
browser-playable WAV audio locally before saving it.

The picker reads OpenRouter's normalized metadata through its official
TypeScript SDK. Monosai shows the advertised modalities, context length,
parameters, reasoning efforts, and voice IDs, and turns supported choices into
fields. All of that is advisory; the test still proves that the exact model
works with the saved key and Monosai's request contract. Changing the model, or
how it thinks, is what makes another test necessary, so one runs then.

Changing a model never removes readings, generated aids, or saved audio, and a
replacement must pass its test before it is used.

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
- Importing an Anki package, including one shared into the installed Android
  PWA, after the package parser and language assets have been used online once.

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
