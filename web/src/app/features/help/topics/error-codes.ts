/** One code a failure screen can print, with its cause and fix in one line. */
export interface ErrorCodeEntry {
  readonly code: string;
  readonly text: string;
}

export interface ErrorCodeGroup {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly ErrorCodeEntry[];
}

/**
 * The codes the failure screens print, grouped by the first half of the code.
 *
 * The on-screen wording lives in `ai-error-copy.ts` and `anki-error-copy.ts`; this
 * is the cause and next step in one line, keyed so a code seen on a screen can be found
 * on this page by its name.
 */
export const ERROR_CODE_GROUPS: readonly ErrorCodeGroup[] = [
  {
    id: 'ai',
    title: 'OpenRouter: stories, translation, notes, and audio',
    entries: [
      { code: 'ai/offline', text: 'No connection. Reconnect and try again.' },
      { code: 'ai/timeout', text: 'OpenRouter did not answer. Try again.' },
      { code: 'ai/cancelled', text: 'The request was stopped. Run it again.' },
      {
        code: 'ai/authentication',
        text: 'OpenRouter refused the key. Check it at openrouter.ai and save it again.',
      },
      {
        code: 'ai/credit-exhausted',
        text: 'The account is out of credit. Add credit at openrouter.ai.',
      },
      { code: 'ai/model-not-found', text: 'No model has that ID. Check the ID in Settings.' },
      {
        code: 'ai/capability-unsupported',
        text: 'The model cannot return structured replies. Choose a different model.',
      },
      { code: 'ai/rate-limited', text: 'Too many requests. Wait, then try again.' },
      { code: 'ai/provider-unavailable', text: 'OpenRouter failed to answer. Try again shortly.' },
      {
        code: 'ai/malformed-response',
        text: 'The reply had the wrong structure. Try again, or choose another model.',
      },
      {
        code: 'ai/context-budget-exceeded',
        text: 'The request is too large, or the reply was cut off. Choose a model with more room.',
      },
      {
        code: 'ai/audio-invalid',
        text: 'The audio clip was unusable. Try a different voice model.',
      },
      { code: 'ai/unknown', text: 'Not recognised. Try again.' },
    ],
  },
  {
    id: 'anki',
    title: 'Anki: your words',
    entries: [
      {
        code: 'anki/ankidroid-not-installed',
        text: 'AnkiDroid was not found. Install 2.24 or newer and open it.',
      },
      {
        code: 'anki/ankidroid-permission-denied',
        text: 'AnkiDroid has not given the bridge access. Grant it in Monosai Bridge.',
      },
      { code: 'anki/not-running', text: 'Anki is not reachable. Open Anki with AnkiConnect.' },
      {
        code: 'anki/bridge-not-running',
        text: 'The bridge is not reachable. Open Monosai Bridge and press Start.',
      },
      {
        code: 'anki/bridge-too-old',
        text: 'The bridge is out of date. Update it from the Releases page.',
      },
      {
        code: 'anki/addon-missing-or-unreachable',
        text: 'AnkiConnect did not answer. Install and enable it (code 2055492159).',
      },
      {
        code: 'anki/permission-denied',
        text: "AnkiConnect refused Monosai. Allow it in AnkiConnect's settings.",
      },
      {
        code: 'anki/api-key-required',
        text: 'AnkiConnect wants an API key, which Monosai does not support. Turn it off, or import a package.',
      },
      {
        code: 'anki/origin-not-allowed',
        text: 'This address is not in webCorsOriginList. Add it, restart Anki. Your words has the config line.',
      },
      { code: 'anki/timeout', text: 'Anki was too slow. Try again.' },
      {
        code: 'anki/unsupported-api',
        text: 'The answer was not understood. Update Anki and AnkiConnect.',
      },
      {
        code: 'anki/unsupported-action',
        text: 'A needed read operation is missing. Update Anki and AnkiConnect.',
      },
      { code: 'anki/malformed-response', text: 'The answer was unexpected. Try again.' },
      { code: 'anki/deck-discovery-failed', text: 'The deck list could not be read. Try again.' },
      {
        code: 'anki/note-type-discovery-failed',
        text: 'The note type list could not be read. Try again.',
      },
      {
        code: 'anki/field-discovery-failed',
        text: 'The field list could not be read. Pick another note type, or try again.',
      },
      {
        code: 'anki/review-evidence-unsupported',
        text: 'Studied cards cannot be confirmed. Import a package with scheduling information.',
      },
      {
        code: 'anki/query-failed',
        text: 'Anki could not search reviewed cards. Check your decks and note types.',
      },
      {
        code: 'anki/package-unreadable',
        text: 'The file is not an Anki package. Export a fresh .apkg or .colpkg.',
      },
      {
        code: 'anki/package-schema-unsupported',
        text: 'The package format is not supported. Export again from a current Anki.',
      },
      {
        code: 'anki/package-review-data-missing',
        text: 'The package has no review history. Export with "Include scheduling information".',
      },
      {
        code: 'anki/package-resource-limit',
        text: 'The package is too large. Export only the decks you study from.',
      },
      { code: 'anki/cancelled', text: 'The refresh was stopped. Refresh again.' },
      { code: 'anki/unknown', text: 'Not recognised. Try again, or use a package file.' },
    ],
  },
  {
    id: 'language',
    title: 'Japanese analysis',
    entries: [
      {
        code: 'language/assets-unavailable',
        text: 'The Japanese data did not download. Check your connection and retry.',
      },
      {
        code: 'language/asset-manifest-invalid',
        text: 'The data manifest is unreadable. Retry the download.',
      },
      { code: 'language/asset-integrity-mismatch', text: 'A download was damaged. Retry.' },
      {
        code: 'language/asset-schema-invalid',
        text: 'A downloaded file has the wrong structure. Retry the download.',
      },
      {
        code: 'language/tokenizer-initialization-failed',
        text: 'The tokenizer did not start. Reload the page.',
      },
      {
        code: 'language/dictionary-initialization-failed',
        text: 'The dictionary could not be built. Reload the page.',
      },
      {
        code: 'language/not-initialized',
        text: 'Analysis started too early. Wait a moment and retry.',
      },
      {
        code: 'language/protocol-version-mismatch',
        text: 'An old worker is cached. Reload the page fully.',
      },
      { code: 'language/worker-unavailable', text: 'The worker did not start. Reload the page.' },
      {
        code: 'language/worker-terminated',
        text: 'The worker stopped mid-task. Reload and retry.',
      },
      {
        code: 'language/invalid-request',
        text: 'Internal mismatch. Reload the page, and report it if it repeats.',
      },
      {
        code: 'language/invalid-response',
        text: 'The worker replied unexpectedly. Reload and retry.',
      },
      {
        code: 'language/analysis-failed',
        text: 'Analysis failed. Retry; if one text keeps failing, report it.',
      },
      {
        code: 'language/snapshot-not-compiled',
        text: 'Your words are still being prepared. Wait a moment and retry.',
      },
      { code: 'language/cancelled', text: 'Analysis was stopped. Retry when ready.' },
      { code: 'language/unknown', text: 'Not recognised. Reload and retry.' },
    ],
  },
  {
    id: 'storage',
    title: 'Storage on this device',
    entries: [
      {
        code: 'storage/quota',
        text: 'The device is out of space. Free some, or delete saved audio in Settings.',
      },
      {
        code: 'storage/blocked',
        text: 'The database is blocked. Close other Monosai tabs and retry.',
      },
      {
        code: 'storage/corrupt-record',
        text: 'A saved record is unreadable. Retry; if it repeats, remove and re-add the story.',
      },
      { code: 'storage/transaction-aborted', text: 'The browser aborted the write. Retry.' },
      { code: 'storage/unavailable', text: 'Browser storage is unavailable. Use a normal window.' },
      {
        code: 'storage/migration-failed',
        text: 'The saved data could not be upgraded. Report it with diagnostics.',
      },
      {
        code: 'storage/newer-version',
        text: 'Your data is from a newer version. Reload to update.',
      },
      { code: 'storage/not-found', text: 'The record no longer exists. Go back.' },
      { code: 'storage/conflict', text: 'Another tab changed the same data. Retry in one tab.' },
      { code: 'storage/unknown', text: 'Not recognised. Retry, then check Storage in Settings.' },
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
    symptom: 'No Install button in Settings.',
    explanation:
      'It shows under About only while Monosai is not installed and Chrome is offering the prompt.',
  },
  {
    id: 'no-share-target',
    symptom: "Monosai is missing from AnkiDroid's share sheet.",
    explanation:
      'Sharing works only with the installed Android Chrome app. Reinstall it, or use the file picker.',
  },
  {
    id: 'package-rejected',
    symptom: 'A shared package is rejected.',
    explanation:
      'Share exactly one .apkg or .colpkg file under 512 MB. If Android reports low storage, free some space.',
  },
  {
    id: 'blank-offline',
    symptom: 'A story opens blank offline.',
    explanation: 'Open any story online once, so the language data is downloaded.',
  },
  {
    id: 'no-update-banner',
    symptom: 'No update banner, though a newer version exists.',
    explanation: 'Check for updates under About in Settings forces a check.',
  },
];
