import type { AnkiErrorCode } from '../../domain/anki/anki-error';

/**
 * What the learner is told about one failure.
 *
 * Every failure has to say what failed, what did not fail, whether anything was
 * saved, a primary next action, and a way out. Splitting those into fields
 * rather than one sentence is what stops a variant from quietly losing one of
 * them.
 */
export interface AnkiErrorCopy {
  readonly heading: string;
  readonly whatFailed: string;
  /** Always reassuring: no failure here can touch stored vocabulary. */
  readonly whatDidNot: string;
  readonly primaryAction: string;
  readonly escape: string;
}

/** True for every variant: nothing is written until a snapshot is confirmed. */
export const NOTHING_SAVED =
  'Nothing was changed. Your existing vocabulary snapshot is still active.';

const USE_PACKAGE = 'Export a package from Anki and import it here instead.';
const TRY_AGAIN = 'Try again.';

/**
 * English for all twenty-one Anki failures.
 *
 * The specification requires the UI to preserve every distinction the error
 * model makes, so this is exhaustive by type: adding a variant to
 * `AnkiErrorCode` will not compile until it has been given words here.
 *
 * Nothing in this table claims Monosai can start, install, or configure Anki or
 * AnkiDroid. Those are things the learner does outside the application, and
 * saying otherwise would be a promise the browser cannot keep.
 */
export const ANKI_ERROR_COPY: Record<AnkiErrorCode, AnkiErrorCopy> = {
  'not-running': {
    heading: 'Anki is not answering',
    whatFailed: 'Monosai could not reach AnkiConnect on this computer.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Open Anki on this computer, then test the connection again.',
    escape: USE_PACKAGE,
  },
  'bridge-not-running': {
    heading: 'The Anki bridge is not answering',
    whatFailed: 'Monosai could not reach an AnkiConnect-compatible bridge on this device.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Start the bridge outside Monosai, then test the connection again.',
    escape: USE_PACKAGE,
  },
  'addon-missing-or-unreachable': {
    heading: 'AnkiConnect was not found',
    whatFailed: 'Anki answered, but the AnkiConnect add-on did not.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Check that AnkiConnect is installed and enabled in Anki.',
    escape: USE_PACKAGE,
  },
  'permission-denied': {
    heading: 'Anki refused the connection',
    whatFailed: 'AnkiConnect did not grant Monosai permission to read your collection.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Allow Monosai in the AnkiConnect settings, then test the connection again.',
    escape: USE_PACKAGE,
  },
  'origin-not-allowed': {
    heading: 'Anki refused this address',
    whatFailed: 'AnkiConnect is running but does not accept requests from this address.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: "Add this address to AnkiConnect's allowed origins, then test again.",
    escape: USE_PACKAGE,
  },
  'private-network-blocked': {
    heading: 'Your browser blocked the connection',
    whatFailed:
      'The browser will not let this page reach Anki on your own computer, so the connection cannot be made from here.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: USE_PACKAGE,
    escape: 'Reading, furigana, and the dictionary work without any Anki connection.',
  },
  timeout: {
    heading: 'Anki did not answer in time',
    whatFailed: 'The request took too long and was stopped.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: USE_PACKAGE,
  },
  'unsupported-api': {
    heading: 'This Anki connection is not supported',
    whatFailed: 'The endpoint answered in a way Monosai does not understand.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Update Anki and AnkiConnect, then test the connection again.',
    escape: USE_PACKAGE,
  },
  'unsupported-action': {
    heading: 'This connection is missing something Monosai needs',
    whatFailed: 'The endpoint does not support one of the read operations required.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Update Anki and AnkiConnect, then test the connection again.',
    escape: USE_PACKAGE,
  },
  'malformed-response': {
    heading: 'Anki sent something unreadable',
    whatFailed: 'The answer did not match what Monosai expected.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: USE_PACKAGE,
  },
  'deck-discovery-failed': {
    heading: 'Your decks could not be listed',
    whatFailed: 'The connection worked, but the deck list could not be read.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: USE_PACKAGE,
  },
  'note-type-discovery-failed': {
    heading: 'Your note types could not be listed',
    whatFailed: 'The connection worked, but the note type list could not be read.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: USE_PACKAGE,
  },
  'field-discovery-failed': {
    heading: 'The fields of that note type could not be listed',
    whatFailed: 'The connection worked, but the field list could not be read.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Pick a different note type, or try again.',
    escape: USE_PACKAGE,
  },
  'review-evidence-unsupported': {
    heading: 'This source cannot show what you have reviewed',
    whatFailed:
      'Monosai could not confirm which cards have been studied, and will not treat unreviewed cards as vocabulary you know.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: USE_PACKAGE,
    escape: 'Reading, furigana, and the dictionary work without any Anki connection.',
  },
  'query-failed': {
    heading: 'The vocabulary search failed',
    whatFailed: 'Anki could not answer the search for reviewed cards.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: 'Check that your sources still match the decks and note types in Anki.',
  },
  'package-unreadable': {
    heading: 'That file could not be read',
    whatFailed: 'The file is not a readable Anki package.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export a fresh package from Anki and try that file.',
    escape: 'A local Anki connection is the other way to read your vocabulary.',
  },
  'package-schema-unsupported': {
    heading: 'That package format is not supported',
    whatFailed: 'The collection inside the package is in a format Monosai cannot open.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export the package again from a current version of Anki.',
    escape: 'A local Anki connection is the other way to read your vocabulary.',
  },
  'package-review-data-missing': {
    heading: 'That package has no review history',
    whatFailed:
      'The package does not record which cards were reviewed, so Monosai cannot tell which vocabulary you already know.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export the package again with scheduling information included.',
    escape: 'A local Anki connection is the other way to read your vocabulary.',
  },
  'package-resource-limit': {
    heading: 'That package is too large to process',
    whatFailed: 'The package is bigger or more deeply compressed than Monosai will open.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export a package containing only the decks you study from.',
    escape: 'A local Anki connection is the other way to read your vocabulary.',
  },
  cancelled: {
    heading: 'Refresh cancelled',
    whatFailed: 'The refresh was stopped before it finished.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Start the refresh again when you are ready.',
    escape: 'Your existing vocabulary is unaffected.',
  },
  unknown: {
    heading: 'Something went wrong',
    whatFailed: 'The vocabulary source could not be read.',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
    escape: USE_PACKAGE,
  },
};

/** Storage and language failures reach this screen too, so they need words as well. */
export const REFRESH_STORAGE_FAILURE: AnkiErrorCopy = {
  heading: 'The snapshot could not be saved',
  whatFailed: 'Monosai could not write the new vocabulary snapshot.',
  whatDidNot: NOTHING_SAVED,
  primaryAction: 'Free up space on this device, then refresh again.',
  escape: 'Everything you have already saved is unchanged.',
};

export const REFRESH_LANGUAGE_FAILURE: AnkiErrorCopy = {
  heading: 'Japanese language support is unavailable',
  whatFailed: 'Monosai could not prepare the tokenizer needed to read your vocabulary.',
  whatDidNot: NOTHING_SAVED,
  primaryAction: 'Check your connection and try again.',
  escape: 'Your existing vocabulary is unaffected.',
};

export function copyForFailure(error: {
  readonly domain: string;
  readonly code: string;
}): AnkiErrorCopy {
  if (error.domain === 'storage') {
    return REFRESH_STORAGE_FAILURE;
  }
  if (error.domain === 'language') {
    return REFRESH_LANGUAGE_FAILURE;
  }
  // A `Record` lookup is typed as always present, but the code arriving here
  // came from a runtime value and may name a variant this table predates.
  const table: Partial<Record<string, AnkiErrorCopy>> = ANKI_ERROR_COPY;
  return table[error.code] ?? ANKI_ERROR_COPY.unknown;
}
