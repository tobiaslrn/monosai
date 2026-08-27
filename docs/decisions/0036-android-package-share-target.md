# 0036 — Android package sharing uses a service-worker inbox

Date: 2026-08-27
Status: Accepted

## Context

An installed Android PWA can receive files from the system share sheet only
through a manifest file share target. The browser submits that target as a
multipart POST before an application page necessarily exists. Angular's
service worker owns Monosai's offline navigation and update lifecycle, while an
Anki package may be hundreds of megabytes and must not be copied into the
application database before the learner accepts an ambiguous mapping.

## Decision

- Register `monosai-sw.js`, whose fetch listener handles only the scoped
  `share-target` POST and is installed before `ngsw-worker.js` is imported.
- Accept ZIP and generic-binary MIME types plus `.apkg`/`.colpkg` extensions in
  the manifest. Do not accept `*/*`, which would advertise Monosai for unrelated
  photos and documents.
- Validate exactly one package and the existing 512 MB ceiling in the wrapper.
  Replace one Cache Storage inbox entry and return a `303 See Other` redirect
  inside the service-worker scope. When offline, Chromium follows that redirect
  outside the intercepted fetch, so the wrapper instead serves Angular's
  already-cached `index.html` and updates history to the fixed marker before
  bootstrap. Failures use the same route with a bounded reason code.
- Claim and delete the inbox entry through an application port. Ignore stale
  entries, retain the resulting blob only for the active import/retry flow, and
  keep Dexie writes inside the final atomic vocabulary commit.
- Route the desktop file picker through the same import store, so transport does
  not change validation, mapping inference, replacement, or failure semantics.

## Consequences

- Android Chrome installed PWAs get a direct AnkiDroid share path; desktop and
  unsupported browsers keep the file picker.
- A browser or process exit while the chooser is open loses the temporary file
  by design, but cannot partially update vocabulary. The update registry blocks
  activation while that chooser owns the blob.
- Cache Storage is transport only, not a second vocabulary store. A later share
  replaces an unclaimed earlier share and old entries cannot import themselves.
- Physical-device AnkiDroid compatibility remains a manual release check; the
  automated PWA suite proves the browser POST, offline handoff, and cleanup.
