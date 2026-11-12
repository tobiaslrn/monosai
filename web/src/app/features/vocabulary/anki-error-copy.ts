import type { AnkiErrorCode } from '../../domain/anki/anki-error';
import type { HostPlatform } from '../../domain/platform/host-platform';
import { ANKI_LINKS } from './anki-links';

/**
 * What the learner is told about one failure.
 *
 * Every failure is a title, one next action, and the one safety line.
 * Splitting those into fields rather than one sentence is what stops a variant
 * from quietly losing one of them.
 */
export interface AnkiErrorCopy {
  readonly heading: string;
  /** Always reassuring: no failure here can touch stored vocabulary. */
  readonly whatDidNot: string;
  readonly primaryAction: string;
}

/** True for every variant: nothing is written until a refresh is confirmed. */
export const NOTHING_SAVED = 'Your words are unchanged.';

const TRY_AGAIN = 'Try again.';

/**
 * English for every Anki failure.
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
  'ankidroid-not-installed': {
    heading: 'AnkiDroid was not found',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Install AnkiDroid 2.24 or newer and open it.',
  },
  'ankidroid-permission-denied': {
    heading: 'The bridge needs access to AnkiDroid',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Grant access in Monosai Bridge.',
  },
  'not-running': {
    heading: 'Anki is not answering',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Open Anki with the AnkiConnect add-on.',
  },
  'bridge-not-running': {
    heading: 'The Anki bridge is not answering',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Start the bridge.',
  },
  'bridge-too-old': {
    heading: 'This bridge is too old',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Update Monosai Bridge.',
  },
  'addon-missing-or-unreachable': {
    heading: 'AnkiConnect was not found',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Install and enable AnkiConnect in Anki.',
  },
  'permission-denied': {
    heading: 'Anki refused the connection',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Allow Monosai in the AnkiConnect settings.',
  },
  'api-key-required': {
    heading: 'AnkiConnect needs an API key',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Import an Anki export file instead.',
  },
  'origin-not-allowed': {
    heading: 'Anki refused this address',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Allow this address in AnkiConnect or Monosai Bridge.',
  },
  timeout: {
    heading: 'Anki did not answer in time',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
  'unsupported-api': {
    heading: 'This Anki connection is not supported',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Update Anki and AnkiConnect.',
  },
  'unsupported-action': {
    heading: 'This connection is missing something Monosai needs',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Update Anki and AnkiConnect.',
  },
  'malformed-response': {
    heading: 'Anki sent something unreadable',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
  'deck-discovery-failed': {
    heading: 'Your decks could not be listed',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
  'note-type-discovery-failed': {
    heading: 'Your note types could not be listed',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
  'field-discovery-failed': {
    heading: 'The fields of that note type could not be listed',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Pick a different note type, or try again.',
  },
  'review-evidence-unsupported': {
    heading: 'This source cannot show what you have reviewed',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Import an Anki export file instead.',
  },
  'query-failed': {
    heading: 'The word search failed',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
  'package-unreadable': {
    heading: 'That file could not be read',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export a fresh package from Anki.',
  },
  'package-schema-unsupported': {
    heading: 'That package format is not supported',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export again from a current version of Anki.',
  },
  'package-review-data-missing': {
    heading: 'That package has no review history',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export again with scheduling information.',
  },
  'package-resource-limit': {
    heading: 'That package is too large to process',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Export only the decks you study from.',
  },
  cancelled: {
    heading: 'Refresh cancelled',
    whatDidNot: NOTHING_SAVED,
    primaryAction: 'Refresh again.',
  },
  unknown: {
    heading: 'Something went wrong',
    whatDidNot: NOTHING_SAVED,
    primaryAction: TRY_AGAIN,
  },
};

/** Storage and language failures reach this screen too, so they need words as well. */
export const REFRESH_STORAGE_FAILURE: AnkiErrorCopy = {
  heading: 'The current vocabulary could not be updated',
  whatDidNot: NOTHING_SAVED,
  primaryAction: 'Free up space on this device, then refresh again.',
};

export const REFRESH_LANGUAGE_FAILURE: AnkiErrorCopy = {
  heading: 'Japanese language support is unavailable',
  whatDidNot: NOTHING_SAVED,
  primaryAction: 'Check your connection and try again.',
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

/** A sentence that may carry one link, so prose and its link stay one thought. */
export interface FailureParagraph {
  readonly before: string;
  readonly link?: { readonly href: string; readonly text: string };
  readonly after?: string;
}

/**
 * What a failed connection attempt says, on the platform it failed on.
 *
 * Separate from `ANKI_ERROR_COPY` because that table answers "what does this
 * code mean" for every surface, and this answers the narrower question the
 * connect panel asks: the learner has just pressed Anki, nothing happened, and
 * there is exactly one thing to go and fix.
 */
export interface ConnectFailureCopy {
  readonly headline: string;
  readonly paragraphs: readonly FailureParagraph[];
  /**
   * Whether to offer the port.
   *
   * Only where a port is a thing the learner can have wrong: the bridge fixes
   * its own, and no other failure is a question of where to knock.
   */
  readonly offersPort: boolean;
}

/** Beside the "reads, never writes" claim, which is worth little unchecked. */
const BRIDGE_IS_READ_ONLY: FailureParagraph = {
  before: 'It only reads your collection. ',
  link: { href: ANKI_LINKS.bridgeSource, text: 'View the source' },
};

export function connectFailureCopy(
  platform: HostPlatform,
  error: { readonly domain: string; readonly code: string },
  _port: number,
): ConnectFailureCopy {
  if (platform === 'android' && error.code === 'bridge-not-running') {
    return {
      headline: 'The bridge is not running',
      paragraphs: [
        {
          before: 'Open Monosai Bridge and press Start. ',
          link: { href: ANKI_LINKS.bridgeReleases, text: 'Get the bridge' },
        },
        BRIDGE_IS_READ_ONLY,
      ],
      offersPort: false,
    };
  }
  if (platform === 'android' && error.code === 'bridge-too-old') {
    return {
      headline: 'The bridge is out of date',
      paragraphs: [
        {
          before: 'Update Monosai Bridge. ',
          link: { href: ANKI_LINKS.bridgeReleases, text: 'Get the latest version' },
        },
        BRIDGE_IS_READ_ONLY,
      ],
      offersPort: false,
    };
  }
  if (platform === 'android' && error.code === 'ankidroid-not-installed') {
    return {
      headline: 'AnkiDroid was not found',
      paragraphs: [{ before: 'Install AnkiDroid 2.24 or newer and open it.' }, BRIDGE_IS_READ_ONLY],
      offersPort: false,
    };
  }
  if (platform === 'android' && error.code === 'ankidroid-permission-denied') {
    return {
      headline: 'The bridge cannot read AnkiDroid',
      paragraphs: [{ before: 'Grant access in Monosai Bridge.' }, BRIDGE_IS_READ_ONLY],
      offersPort: false,
    };
  }
  if (platform === 'desktop' && error.code === 'not-running') {
    return {
      headline: 'Anki is not answering',
      paragraphs: [
        {
          before: 'Open Anki with the ',
          link: { href: ANKI_LINKS.ankiConnectAddon, text: 'AnkiConnect add-on' },
          after: '.',
        },
      ],
      offersPort: true,
    };
  }
  if (platform === 'desktop' && error.code === 'addon-missing-or-unreachable') {
    return {
      headline: 'AnkiConnect did not answer',
      paragraphs: [
        {
          before: 'Install and enable the ',
          link: { href: ANKI_LINKS.ankiConnectAddon, text: 'AnkiConnect add-on' },
          after: ', then restart Anki.',
        },
      ],
      offersPort: true,
    };
  }
  // Everything else already has words that fit here: what failed, then the one
  // thing to do about it.
  const copy = copyForFailure(error);
  return {
    headline: copy.heading,
    paragraphs: [{ before: copy.primaryAction }],
    offersPort: platform === 'desktop',
  };
}
