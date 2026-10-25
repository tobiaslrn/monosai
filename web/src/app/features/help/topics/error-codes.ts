/** One code a failure screen can print, with what caused it and what to do. */
export interface ErrorCodeEntry {
  readonly code: string;
  readonly cause: string;
  readonly fix: string;
}

export interface ErrorCodeGroup {
  readonly id: string;
  readonly title: string;
  readonly lead: string;
  readonly entries: readonly ErrorCodeEntry[];
}

/**
 * The codes the failure screens print, grouped by the first half of the code.
 *
 * The on-screen wording lives in `ai-error-copy.ts` and `anki-error-copy.ts`; this
 * is the longer cause and next step, keyed so a code seen on a screen can be found
 * on this page by its name.
 */
export const ERROR_CODE_GROUPS: readonly ErrorCodeGroup[] = [
  {
    id: 'ai',
    title: 'OpenRouter: stories, translation, notes, and audio',
    lead: 'Only the optional AI features use OpenRouter. Reading, importing, and your word lists work without it.',
    entries: [
      {
        code: 'ai/offline',
        cause: 'This device has no connection.',
        fix: 'Reconnect and try again.',
      },
      {
        code: 'ai/timeout',
        cause: 'OpenRouter did not answer before the request was given up on.',
        fix: 'Try again. A slower model sometimes needs a second attempt.',
      },
      {
        code: 'ai/cancelled',
        cause:
          'The request was stopped before it finished, usually by leaving the screen or pressing Cancel.',
        fix: 'Run it again when you are ready.',
      },
      {
        code: 'ai/authentication',
        cause: 'OpenRouter rejected the saved key.',
        fix: 'Check the key at openrouter.ai, then save it again in Settings.',
      },
      {
        code: 'ai/credit-exhausted',
        cause:
          'The key works, but the account behind it has no credit left. Saving the key again will not help, which is why this is its own code.',
        fix: 'Add credit at openrouter.ai, then try again.',
      },
      {
        code: 'ai/model-not-found',
        cause: 'OpenRouter has no model with that exact ID.',
        fix: 'Copy the ID from the OpenRouter models page. IDs are case-sensitive and look like vendor/model-name.',
      },
      {
        code: 'ai/capability-unsupported',
        cause:
          'The model refused part of what Monosai asks for, usually structured output. Working in an ordinary chat is not enough: Monosai needs exact structured replies.',
        fix: 'Choose a different model or voice.',
      },
      {
        code: 'ai/rate-limited',
        cause: 'Too many requests reached OpenRouter in a short time.',
        fix: 'Wait, then try again.',
      },
      {
        code: 'ai/provider-unavailable',
        cause: 'OpenRouter did not answer, or answered with an error of its own.',
        fix: 'Try again shortly.',
      },
      {
        code: 'ai/malformed-response',
        cause: 'The model answered, but not in the exact shape Monosai needs.',
        fix: 'Try again. If it still fails, choose a different model: one that keeps failing cannot be used for generation.',
      },
      {
        code: 'ai/context-budget-exceeded',
        cause:
          'The request needed more input than the model accepts. When the message says the reply was cut off, the model instead ran out of room to answer, typically a reasoning model spending its budget on hidden tokens.',
        fix: 'Choose a model with a larger context window. For a cut-off reply, try again, raise the story token limit in Settings, or pick a model with more room. Shortening the request will not help.',
      },
      {
        code: 'ai/audio-invalid',
        cause:
          'The audio clip that came back was empty, in an unsupported format, or could not be decoded.',
        fix: 'Try a different voice model or voice. Audio never blocks reading.',
      },
      {
        code: 'ai/unknown',
        cause: 'The request failed in a way Monosai could not classify.',
        fix: 'Try again. Reading and your words still work without it.',
      },
    ],
  },
  {
    id: 'anki',
    title: 'Anki: your words',
    lead: 'Monosai only ever reads from Anki.',
    entries: [
      {
        code: 'anki/not-running',
        cause: 'Monosai could not reach AnkiConnect on this computer.',
        fix: 'Open Anki, then test the connection again.',
      },
      {
        code: 'anki/bridge-not-running',
        cause: 'Monosai could not reach the bridge on this Android device.',
        fix: 'Open Monosai Bridge, press Start, then test again.',
      },
      {
        code: 'anki/bridge-too-old',
        cause:
          'The bridge answered, but it is older than this version of Monosai can read a collection from.',
        fix: 'Update Monosai Bridge from the Releases page of the repository, then test again.',
      },
      {
        code: 'anki/addon-missing-or-unreachable',
        cause: 'Anki answered, but the AnkiConnect add-on did not.',
        fix: 'Check that AnkiConnect (code 2055492159) is installed and enabled.',
      },
      {
        code: 'anki/permission-denied',
        cause: 'AnkiConnect did not grant Monosai permission.',
        fix: "Allow Monosai in AnkiConnect's settings, then test again.",
      },
      {
        code: 'anki/origin-not-allowed',
        cause:
          "AnkiConnect is reachable, but its webCorsOriginList does not include this page's exact origin.",
        fix: 'Add the origin to webCorsOriginList in the AnkiConnect config, restart Anki, and test again. Your words has the config line.',
      },
      {
        code: 'anki/timeout',
        cause: 'The request took too long and was stopped.',
        fix: 'Try again.',
      },
      {
        code: 'anki/unsupported-api',
        cause: 'AnkiConnect answered in a way Monosai does not understand.',
        fix: 'Update Anki and AnkiConnect, then test again.',
      },
      {
        code: 'anki/unsupported-action',
        cause: 'The endpoint does not support one of the read-only operations Monosai needs.',
        fix: 'Update Anki and AnkiConnect, then test again.',
      },
      {
        code: 'anki/malformed-response',
        cause: 'The answer did not match what Monosai expected.',
        fix: 'Try again.',
      },
      {
        code: 'anki/deck-discovery-failed',
        cause: 'The connection works, but the deck list could not be read.',
        fix: 'Try again.',
      },
      {
        code: 'anki/note-type-discovery-failed',
        cause: 'The connection works, but the note type list could not be read.',
        fix: 'Try again.',
      },
      {
        code: 'anki/field-discovery-failed',
        cause:
          'The connection works, but the field list for the chosen note type could not be read.',
        fix: 'Pick a different note type, or try again.',
      },
      {
        code: 'anki/review-evidence-unsupported',
        cause: 'Monosai could not confirm which cards you have studied, and refuses to guess.',
        fix: 'Export a package with scheduling information instead.',
      },
      {
        code: 'anki/query-failed',
        cause: 'Anki could not answer the search for reviewed cards.',
        fix: 'Check that your chosen decks and note types still exist, then try again.',
      },
      {
        code: 'anki/package-unreadable',
        cause: 'The chosen file is not a readable Anki package.',
        fix: 'Export a fresh .apkg or .colpkg from Anki.',
      },
      {
        code: 'anki/package-schema-unsupported',
        cause: 'The collection inside the package uses a format Monosai cannot open.',
        fix: 'Export again from a current version of Anki.',
      },
      {
        code: 'anki/package-review-data-missing',
        cause:
          'The package has no review history, so Monosai cannot tell which words you already know.',
        fix: 'Export again with "Include scheduling information" checked.',
      },
      {
        code: 'anki/package-resource-limit',
        cause: 'The package is larger, or more deeply compressed, than Monosai will process.',
        fix: 'Export a package containing only the decks you study from.',
      },
      {
        code: 'anki/cancelled',
        cause: 'The refresh was stopped before it finished.',
        fix: 'Start the refresh again when you are ready.',
      },
      {
        code: 'anki/unknown',
        cause: 'The words could not be read for a reason Monosai could not classify.',
        fix: 'Try again, or use a package file.',
      },
    ],
  },
  {
    id: 'language',
    title: 'Japanese analysis',
    lead: 'The tokenizer, dictionary, and grammar data are downloaded once and kept on the device. Most of these codes mean that download, or the worker running on top of it, needs another try.',
    entries: [
      {
        code: 'language/assets-unavailable',
        cause:
          'The language data could not be downloaded, because you are offline or the server had a problem.',
        fix: 'Check your connection, then retry what needed it.',
      },
      {
        code: 'language/asset-manifest-invalid',
        cause: "The language data's manifest could not be read.",
        fix: 'Retry the download. If it repeats, the published data itself needs fixing.',
      },
      {
        code: 'language/asset-integrity-mismatch',
        cause:
          'A downloaded file does not match its checksum. The download was damaged, which is not a bug in the app.',
        fix: 'Retry. A fresh download replaces the bad bytes.',
      },
      {
        code: 'language/asset-schema-invalid',
        cause: 'A downloaded file was read, but its structure is not what the app expects.',
        fix: 'Retry the download. If it repeats, the published data needs fixing.',
      },
      {
        code: 'language/tokenizer-initialization-failed',
        cause: 'The WebAssembly tokenizer failed to start.',
        fix: 'Reload the page. If it repeats on this device, the browser may lack a capability Monosai needs.',
      },
      {
        code: 'language/dictionary-initialization-failed',
        cause: 'The dictionary index could not be built from its downloaded data.',
        fix: 'Reload the page so the download and the index are built again.',
      },
      {
        code: 'language/not-initialized',
        cause: 'Something asked for analysis before the language runtime finished starting.',
        fix: 'Wait a moment and retry.',
      },
      {
        code: 'language/protocol-version-mismatch',
        cause:
          'The background worker and the page disagree on their message version, which happens when an old worker is cached after an update.',
        fix: 'Reload the page fully. The update banner reloads it in the right way too.',
      },
      {
        code: 'language/worker-unavailable',
        cause: 'The background worker that runs analysis could not be started.',
        fix: 'Reload the page.',
      },
      {
        code: 'language/worker-terminated',
        cause: 'The worker stopped unexpectedly in the middle of a task.',
        fix: 'Reload the page and retry.',
      },
      {
        code: 'language/invalid-request',
        cause:
          'The app sent the worker a request it does not recognise. That is an internal inconsistency, and a retry will not fix it on its own.',
        fix: 'Reload the page. If it repeats, report it.',
      },
      {
        code: 'language/invalid-response',
        cause: 'The worker answered in a shape the app does not recognise.',
        fix: 'Reload the page and retry.',
      },
      {
        code: 'language/analysis-failed',
        cause: 'Analysing the given text failed.',
        fix: 'Retry. If one particular text keeps failing, it may contain something the analyser cannot handle.',
      },
      {
        code: 'language/snapshot-not-compiled',
        cause: 'A word snapshot exists but has not been prepared for matching yet.',
        fix: 'Wait a moment and retry. This resolves itself once preparation finishes.',
      },
      {
        code: 'language/cancelled',
        cause: 'The analysis was stopped before it finished, usually by navigating away.',
        fix: 'Retry when you are ready.',
      },
      {
        code: 'language/unknown',
        cause: 'Analysis failed for a reason Monosai could not classify.',
        fix: 'Reload the page and retry.',
      },
    ],
  },
  {
    id: 'storage',
    title: 'Storage on this device',
    lead: 'Everything is kept in this browser. A failed write leaves what was already saved untouched.',
    entries: [
      {
        code: 'storage/quota',
        cause:
          'The browser refused a write because this device is out of the space it allows Monosai.',
        fix: "Free some space, or delete Monosai's saved audio under Storage in Settings.",
      },
      {
        code: 'storage/blocked',
        cause:
          'The database is blocked, usually by another open tab still running an older version during an update.',
        fix: 'Close other Monosai tabs and windows, then retry.',
      },
      {
        code: 'storage/corrupt-record',
        cause: 'A saved record could not be read back in the shape it was written.',
        fix: 'Retry. If it repeats for the same story, that story may need to be removed and imported again.',
      },
      {
        code: 'storage/transaction-aborted',
        cause: 'The browser aborted the write, usually for a passing reason.',
        fix: 'Retry.',
      },
      {
        code: 'storage/unavailable',
        cause:
          'Browser storage is not available at all. Private windows in some browsers restrict it, and so can a site-data policy.',
        fix: "Use a normal browsing window, or check the browser's site-data settings.",
      },
      {
        code: 'storage/migration-failed',
        cause:
          'The saved data could not be upgraded to what this version expects. This should not happen on a normal update.',
        fix: 'Report it with the copied diagnostics. Exporting your Anki words as a package file keeps them safe. Deleting everything under Storage in Settings is the last resort, and it cannot be undone.',
      },
      {
        code: 'storage/not-found',
        cause:
          'The app tried to read a record that no longer exists, because it was already deleted.',
        fix: 'Go back. A story that vanished unexpectedly does not come back.',
      },
      {
        code: 'storage/conflict',
        cause: 'A write from another tab conflicted with this one.',
        fix: 'Retry, and avoid running the same import or generation in two tabs at once.',
      },
      {
        code: 'storage/unknown',
        cause: 'A storage operation failed for a reason Monosai could not classify.',
        fix: 'Retry. If it repeats, check Storage in Settings for durability and usage.',
      },
    ],
  },
];

/** Conditions that look like one of the codes above and are not. */
export interface PlatformCondition {
  readonly id: string;
  readonly symptom: string;
  readonly explanation: string;
}

export const PLATFORM_CONDITIONS: readonly PlatformCondition[] = [
  {
    id: 'no-install-button',
    symptom: 'There is no Install button in Settings.',
    explanation:
      'It is shown under About only while Monosai is not installed and Chrome is offering the prompt. Chrome stops offering it once the app is installed, or after it has been dismissed too often. The browser developer tools, under Application and Manifest, name a specific reason when there is one.',
  },
  {
    id: 'no-share-target',
    symptom: "Monosai is missing from AnkiDroid's share sheet.",
    explanation:
      'Sharing a file works only with the installed Android Chrome app. Open Monosai online, let Chrome finish updating it, and reinstall it if it still is not listed. On a desktop or in another browser, use the file picker instead.',
  },
  {
    id: 'package-rejected',
    symptom: 'A shared package is rejected before it opens.',
    explanation:
      'Share exactly one .apkg or .colpkg file smaller than 512 MB. If Android reports low storage, free some space and share it again. The words you had before stay current.',
  },
  {
    id: 'blank-offline',
    symptom: 'A story opens blank while offline.',
    explanation:
      'The story itself is stored on the device, but the language data it needs must have been downloaded once while online. Open any story online once.',
  },
  {
    id: 'no-update-banner',
    symptom: 'The update banner never appears, though a newer version exists.',
    explanation:
      'Updates are checked at intervals, and again when you switch back to the tab. Check for updates under About in Settings forces a check.',
  },
];
