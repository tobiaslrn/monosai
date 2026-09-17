# Setup

Reference detail on installing Monosai, connecting Anki, configuring OpenRouter,
and what works offline.

The guide a learner should read is
[inside the application](https://tobiaslrn.github.io/monosai/#/help): it is
task-ordered, it works offline, and it is where the advice on choosing models
and voices is kept current. This page is the longer reference behind it, for the
mechanics that do not belong on a screen.

For error codes and their recovery, see [troubleshooting.md](troubleshooting.md).
For which combinations have actually been observed rather than assumed, see
[risks and technical debt](arc42/11-risks-and-technical-debt.md).

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

1. Install AnkiDroid and the signed Monosai Bridge APK from a `bridge-v*`
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

Story generation, translation, grammar review, and text-to-speech are optional
and never gate reading, importing, or vocabulary. They use your own
[OpenRouter](https://openrouter.ai/) account and API key, billed to you
directly; Monosai never sees or stores your key anywhere but this browser's
local storage on this device.

1. Create an OpenRouter account and an API key.
2. In Settings → **AI**, open the **OpenRouter key** row, paste the key, and
   press **Connect**. It is never shown again after saving, and the rest of the
   section stays hidden until a key exists, because controls that need one read
   as values nobody chose.
3. Under **Text**, open the model picker, search OpenRouter's catalogue by model
   or provider, and choose one. Models you return to can be kept as favourites.
   **Reasoning** and **Token limit** sit below it, and **Translation and
   grammar** can override the model for those two tasks alone.
4. Press **Test now**. The test spends a small number of tokens proving the model
   answers in Monosai's structured shape, and writes nothing to your library.
   Changing the model or its settings can require another test.
5. **Voice** works the same way, with **Preview** in place of the text test: it
   plays one test sentence, and audio can only be generated once it has passed.
   Where OpenRouter advertises a model's voices, Monosai offers them as a
   dropdown rather than a free-text ID.

Which model to choose, what a weak one gets wrong, and what each costs per story
belong to the application's own guide:
[choosing a text model](https://tobiaslrn.github.io/monosai/#/help/text-models)
and [voice and audio](https://tobiaslrn.github.io/monosai/#/help/voice). Naming
models here as well would give the repository a second copy to keep current, and
it would be the copy nobody reads.

The picker reads OpenRouter's normalized metadata through its official
TypeScript SDK: advertised modalities, context length, parameters, reasoning
efforts, and voice IDs, turned into the fields a model offers. That discovery is
advisory. The test is what proves the exact model works with the saved key and
Monosai's request contract.

A few mechanics are invisible until they matter:

- Choose a named pace — Natural, Slow, or Very slow — for the voice model.
  Instruction-capable models receive that pace as a description; other models
  receive a best-effort numeric `speed`, while Gemini receives no numeric speed.
  The selected speaking style is sent only where the model supports instructions.
- Reading speed is then fine-tuned locally during playback, with pitch
  preservation, so it is consistent across sentences and does not trigger
  regeneration.
- Gemini answers with raw PCM. Monosai converts it to browser-playable WAV audio
  locally before saving it.
- Removing a model never removes readings, generated aids, or saved audio. A
  replacement must be tested before use.

A failed test never affects reading, importing, or anything already saved — see
[troubleshooting.md](troubleshooting.md) for what each `ai/*` code means.

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
