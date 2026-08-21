# Troubleshooting

Monosai's error screens show a copyable technical code shaped `domain/code`
(e.g. `ai/authentication`), produced by `technicalCode()`
([src/app/domain/shared/errors.ts](../src/app/domain/shared/errors.ts)). This
page is keyed by those codes, so a code seen on screen can be looked up
directly. The on-screen wording for `ai/*` and `anki/*` codes comes from
[ai-error-copy.ts](../src/app/shared-ui/ai-error/ai-error-copy.ts) and
[anki-error-copy.ts](../src/app/features/vocabulary/anki-error-copy.ts) — this
page summarizes it rather than duplicating it, and adds the cause and next
step in more depth than fits on screen.

No failure covered here ever affects a reading, a snapshot, or a saved
setting unless stated otherwise: every configuration test and every provider
call writes nothing until it fully succeeds.

## `ai/*` — OpenRouter (text generation, translation, grammar, TTS)

| Code | Cause | Recovery |
| --- | --- | --- |
| `ai/offline` | This device has no connection. | Reconnect and try again. Reading, importing, and vocabulary work without it. |
| `ai/timeout` | OpenRouter did not answer before the request was given up on. | Try again; a slower model sometimes needs a second attempt. |
| `ai/cancelled` | The request was stopped before it finished, usually by leaving the screen or pressing Cancel. | Run it again when ready. |
| `ai/authentication` | The saved API key was rejected, or the OpenRouter account has no remaining credit. | Check the key at openrouter.ai, then save it again in Settings. |
| `ai/model-not-found` | OpenRouter has no model with that exact ID. | Copy the exact ID from OpenRouter's models page; IDs are case-sensitive and look like `vendor/model-name`. |
| `ai/capability-unsupported` | The model refused part of what Monosai's request requires (usually structured output). | Choose a different model or voice. Working in ordinary chat is not sufficient — Monosai needs exact structured replies. |
| `ai/rate-limited` | Too many requests reached OpenRouter in a short time. | Wait, then try again. |
| `ai/provider-unavailable` | OpenRouter did not answer, or answered with its own error. | Try again shortly. |
| `ai/malformed-response` | The model answered, but not in the exact shape Monosai requires. | Try a different model; a model that fails this cannot be used for generation. |
| `ai/context-budget-exceeded` | The request needed more input than the model accepts. | Choose a model with a larger context window. |
| `ai/audio-invalid` | The returned audio clip was empty, in an unsupported format, or undecodable. | Try a different TTS model or voice. Text-to-speech is optional and never blocks reading. |
| `ai/unknown` | The request failed in a way Monosai could not classify. | Try again; if it persists, reading and vocabulary still work without it. |

## `anki/*` — Anki vocabulary source

| Code | Cause | Recovery |
| --- | --- | --- |
| `anki/not-running` | Monosai could not reach AnkiConnect on this computer. | Open Anki, then test the connection again. |
| `anki/bridge-not-running` | Monosai could not reach an AnkiConnect-compatible bridge on this Android device. | Start the bridge outside Monosai, then test again. |
| `anki/addon-missing-or-unreachable` | Anki answered, but the AnkiConnect add-on did not. | Check that AnkiConnect (code `2055492159`) is installed and enabled. |
| `anki/permission-denied` | AnkiConnect did not grant Monosai permission. | Allow Monosai in AnkiConnect's settings, then test again. |
| `anki/origin-not-allowed` | AnkiConnect is reachable but its `webCorsOriginList` does not include this page's exact origin. This is the one setup.md's Anki section exists to prevent. | Add this page's origin to `webCorsOriginList` in AnkiConnect's config, restart Anki, and test again. |
| `anki/timeout` | The request took too long and was stopped. | Try again. |
| `anki/unsupported-api` | AnkiConnect answered in a way Monosai does not understand. | Update Anki and AnkiConnect, then test again. |
| `anki/unsupported-action` | The endpoint does not support one of the read-only operations Monosai needs. | Update Anki and AnkiConnect, then test again. |
| `anki/malformed-response` | The answer did not match what Monosai expected. | Try again. |
| `anki/deck-discovery-failed` | The connection works, but the deck list could not be read. | Try again. |
| `anki/note-type-discovery-failed` | The connection works, but the note type list could not be read. | Try again. |
| `anki/field-discovery-failed` | The connection works, but the field list for a chosen note type could not be read. | Pick a different note type, or try again. |
| `anki/review-evidence-unsupported` | Monosai could not confirm which cards you have actually studied, and refuses to guess. | Export a package with scheduling information instead. |
| `anki/query-failed` | Anki could not answer the search for reviewed cards. | Check that your chosen decks and note types still exist, then try again. |
| `anki/package-unreadable` | The chosen file is not a readable Anki package. | Export a fresh `.apkg`/`.colpkg` from Anki. |
| `anki/package-schema-unsupported` | The collection inside the package uses a format Monosai cannot open. | Re-export from a current version of Anki. |
| `anki/package-review-data-missing` | The package has no review history, so Monosai cannot tell which vocabulary you already know. | Re-export with "Include scheduling information" checked. |
| `anki/package-resource-limit` | The package is larger, or more deeply compressed, than Monosai will process. | Export a package containing only the decks you actually study from. |
| `anki/cancelled` | The refresh was stopped before it finished. | Start the refresh again when ready. |
| `anki/unknown` | The vocabulary source could not be read for an unclassified reason. | Try again, or use the package fallback. |

## `language/*` — Japanese analysis

The tokenizer, dictionary, grammar presets, and structural baseline are
downloaded once and cached; most of these codes mean that download or the
worker that runs on top of it needs to be retried.

| Code | Cause | Recovery |
| --- | --- | --- |
| `language/assets-unavailable` | The language bundle could not be downloaded (offline, or a server problem). | Check your connection and retry from Settings → Language assets. |
| `language/asset-manifest-invalid` | The bundle's manifest could not be parsed. | Retry the download; if it repeats, the deployed bundle itself needs re-publishing. |
| `language/asset-integrity-mismatch` | A downloaded file's digest does not match the manifest — a corrupted or tampered download, never a code bug in the app. | Retry from Settings → Language assets; a fresh download replaces the bad bytes. |
| `language/asset-schema-invalid` | A downloaded file parsed, but its structure does not match what the app expects. | Retry the download; if it repeats, the deployed bundle needs re-publishing. |
| `language/tokenizer-initialization-failed` | The WebAssembly tokenizer failed to start. | Reload the page. If it repeats on this device, the browser may lack a required capability. |
| `language/dictionary-initialization-failed` | The dictionary index failed to build from its downloaded data. | Retry the download from Settings → Language assets. |
| `language/not-initialized` | A feature asked for analysis before the language runtime finished starting. | Wait for Settings → Language assets to report Ready, then retry. |
| `language/protocol-version-mismatch` | The worker and the page disagree on their message protocol version — a stale cached worker after an update. | Reload the page fully (not just navigate); the update banner's controlled reload also fixes this. |
| `language/worker-unavailable` | The background worker that runs analysis could not be started. | Reload the page. |
| `language/worker-terminated` | The worker stopped unexpectedly mid-task. | Reload the page and retry. |
| `language/invalid-request` | The app sent the worker a request it does not recognize — an internal inconsistency, not something a retry fixes on its own. | Reload the page; if it repeats, this is a bug worth reporting. |
| `language/invalid-response` | The worker answered in a shape the app does not recognize. | Reload the page and retry. |
| `language/analysis-failed` | Tokenizing or analyzing the given text failed. | Retry; if one specific text repeatedly fails, it may contain something the analyzer cannot handle. |
| `language/snapshot-not-compiled` | A vocabulary snapshot exists but has not been compiled into a matcher yet. | Wait a moment and retry; this resolves itself once compilation finishes. |
| `language/cancelled` | The analysis was stopped before it finished, usually by navigating away. | Retry when ready. |
| `language/unknown` | Analysis failed for an unclassified reason. | Reload the page and retry. |

## `storage/*` — local data (IndexedDB)

| Code | Cause | Recovery |
| --- | --- | --- |
| `storage/quota` | The browser refused a write because this device is out of storage space allotted to Monosai. | Free up space (uninstall other apps, clear other sites' storage), or clear Monosai's own audio cache in Settings → Storage. Prior data is untouched. |
| `storage/blocked` | The database is blocked, usually by another open tab holding an older version during an update. | Close other Monosai tabs/windows and retry. |
| `storage/corrupt-record` | A stored record could not be read back in the shape it was written. | Retry; if it repeats for the same reading, that reading may need to be removed and re-imported. |
| `storage/transaction-aborted` | The browser aborted the write transaction, usually transiently. | Retry. |
| `storage/unavailable` | IndexedDB is not available at all — private/incognito mode in some browsers disables or restricts it, or storage was disabled by policy. | Use a normal browsing window, or check the browser's site-data settings. |
| `storage/migration-failed` | The stored schema could not be upgraded to what this version of the app expects. | This should not happen on a normal update; if it does, exporting your Anki vocabulary via a package and reporting the issue is the safest path — a full reset (Settings → Storage → danger zone) is the last resort and is irreversible. |
| `storage/not-found` | The app tried to read a record that no longer exists (already deleted). | Usually resolves itself by navigating back; if a reading vanished unexpectedly, it does not reappear. |
| `storage/conflict` | A concurrent write from another tab conflicted with this one. | Retry. Avoid running the same import or generation in two tabs at once. |
| `storage/unknown` | A storage operation failed for an unclassified reason. | Retry; if it repeats, check Settings → Storage for durability and usage. |

## Other platform conditions

These are not `domain/code` pairs shown on an error screen, but conditions
worth naming here because they are easy to misdiagnose as one of the above.

- **The install button stays disabled in Settings.** Chrome only fires
  `beforeinstallprompt` once a page meets its installability criteria
  (manifest, service worker, HTTPS) and has not already been installed or
  dismissed too many times recently. Check DevTools → Application → Manifest
  for a specific reason, or that the app is not already installed.
- **A reading opens blank while offline.** Only readings opened at least once
  while online are guaranteed to be cached by the service worker's shell —
  the reading's own data is in IndexedDB regardless, but assets like the
  tokenizer must have been fetched once first. Open the reading online once.
- **The update banner never appears despite a newer deployed version.**
  Updates are checked on a bounded interval, not instantly; switching back to
  the tab (`visibilitychange`) also triggers a check. Use **Check for
  updates** in Settings → App to force one.
