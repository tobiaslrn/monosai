import type { AiErrorCode } from '../../../domain/ai/ai-error';
import type { AnkiErrorCode } from '../../../domain/anki/anki-error';
import { ALL_ANKI_ERROR_CODES } from '../../../domain/anki/anki-error';
import { AI_ERROR_COPY } from '../../../shared-ui/ai-error/ai-error-copy';
import {
  ANKI_ERROR_COPY,
  connectFailureCopy,
  REFRESH_LANGUAGE_FAILURE,
  REFRESH_STORAGE_FAILURE,
} from '../../vocabulary/anki-error-copy';

/**
 * One thing that can go wrong, looked up by what the learner sees.
 *
 * `seen` is the heading the screen shows, read from the same copy table the
 * failure itself uses, so the guide and the screen cannot drift apart. A
 * failure with two wordings (the connect panel words a few of them for the
 * device) lists both. `text` is the cause and the fix in whole sentences;
 * a control is wrapped in `**` and set in bold. `code` is what a bug report
 * carries, from Copy diagnostics.
 */
export interface TroubleshootingEntry {
  readonly seen: readonly string[];
  readonly text: string;
  readonly code?: string;
}

export interface TroubleshootingGroup {
  readonly id: string;
  readonly title: string;
  /** One sentence on where these messages appear. */
  readonly intro: string;
  readonly entries: readonly TroubleshootingEntry[];
}

const AI_TEXT: Record<AiErrorCode, string> = {
  offline:
    "Your device isn't connected to the internet. Reconnect, then try again. Reading and looking up words still work offline.",
  timeout:
    'OpenRouter took too long to answer. Try again. If it keeps happening, choose a faster model.',
  cancelled: 'The request stopped before it finished. Start it again.',
  authentication:
    "OpenRouter didn't accept your key, perhaps because it was deleted or mistyped. Copy the key from openrouter.ai, then paste it again in **Settings** > **OpenRouter key**.",
  'credit-exhausted':
    'Your OpenRouter account has run out of credit. Add credit on openrouter.ai, then try again.',
  'model-not-found':
    'OpenRouter has no model with that ID, often because it was retired. Choose another one in **Settings** > **Text models** or **Voice**.',
  'capability-unsupported':
    "The model can't answer in the form Monosai needs, or it hasn't passed its test yet. Choose or test a model in **Settings** > **Text models**. For audio, check the model and voice in **Settings** > **Voice**, then select **Play sample**.",
  'rate-limited':
    "OpenRouter or the model's provider is limiting how many requests you can send. Wait a minute, then try again.",
  'provider-unavailable':
    "OpenRouter or the model's provider is having problems. Try again in a few minutes, or choose another model.",
  'malformed-response':
    'The model answered, but not in a form Monosai can use. This happens most often with small and free models. Try again, or choose a different model, as Choose a text model describes.',
  'context-budget-exceeded':
    'The request is larger than the model can take, usually because your word list is long. Choose a model with a larger context.',
  'audio-invalid':
    "The speech model sent audio that can't be played. Choose a different speech model or voice in **Settings** > **Voice**, then select **Play sample**.",
  unknown:
    'Something unexpected went wrong with the request. Try again. If it keeps happening, report it as described at the end of this page.',
};

/** The one AI failure with a heading of its own: the reply, not the request, ran out of room. */
const CUT_OFF: TroubleshootingEntry = {
  seen: ['The reply was cut off'],
  text: 'The model stopped before it finished, usually because it spent its tokens reasoning. Try again, set **Reasoning** lower, or raise the **Token limit** in **Settings** > **Text models**.',
  code: 'ai/context-budget-exceeded',
};

const ANKI_TEXT: Record<AnkiErrorCode, string> = {
  'ankidroid-not-installed':
    "Monosai Bridge can't find AnkiDroid. Install AnkiDroid 2.24 or later, and open your collection once.",
  'ankidroid-permission-denied':
    "Monosai Bridge isn't allowed to read AnkiDroid. Open the bridge and select **Allow**.",
  'not-running':
    "Anki isn't open, or AnkiConnect isn't installed. Open Anki on this computer, then try again.",
  'bridge-not-running': 'Open Monosai Bridge and select **Start**, then try again.',
  'bridge-too-old':
    'Your version of Monosai Bridge is too old for this version of Monosai. Update it from the **Updates** row in the bridge.',
  'addon-missing-or-unreachable':
    "Anki is open, but the AnkiConnect add-on didn't answer. Install it with the code 2055492159, make sure it's enabled, and restart Anki.",
  'permission-denied':
    "AnkiConnect refused Monosai's request. Allow it in AnkiConnect's settings in Anki, then try again.",
  'api-key-required':
    "AnkiConnect is set to require an API key, which Monosai doesn't support. Remove the key in AnkiConnect's settings, or import an Anki export file instead.",
  'origin-not-allowed':
    "AnkiConnect or Monosai Bridge hasn't been told to answer this address. On a computer, add the address to webCorsOriginList, as Add your words describes, and restart Anki. On some setups, this message also appears when Anki simply isn't open.",
  timeout: 'Anki took too long to answer. Try again.',
  'unsupported-api':
    "Monosai didn't understand Anki's answer. Update Anki and AnkiConnect, then try again.",
  'unsupported-action':
    "Your version of Anki or AnkiConnect can't do something Monosai needs. Update both, then try again.",
  'malformed-response': "Anki sent an answer Monosai couldn't read. Try again.",
  'deck-discovery-failed': "Monosai couldn't read your list of decks. Try again.",
  'note-type-discovery-failed': "Monosai couldn't read your list of note types. Try again.",
  'field-discovery-failed':
    "Monosai couldn't read the fields of that note type. Choose a different note type, or try again.",
  'review-evidence-unsupported':
    "This connection can't tell which cards you've reviewed. Import an Anki export file instead.",
  'query-failed':
    "Anki couldn't search your reviewed cards. Check the deck and note type, then try again.",
  'package-unreadable':
    "The file isn't an Anki package, or it's damaged. Export a new .apkg or .colpkg file from Anki.",
  'package-schema-unsupported':
    "The package comes from a version of Anki that Monosai doesn't support. Export it again from a current version.",
  'package-review-data-missing':
    'The package has no review history. Export it again with **Include scheduling information** turned on.',
  'package-resource-limit':
    'The package is too large to process on this device. Export only the decks you study from.',
  cancelled: 'The refresh was stopped before it finished. Refresh again.',
  unknown: 'Something unexpected went wrong. Try again, or import an Anki export file instead.',
};

const AI_CODES = Object.keys(AI_TEXT) as AiErrorCode[];

/** Every heading the learner can see for one Anki failure, on any device. */
function ankiHeadings(code: AnkiErrorCode): readonly string[] {
  const headings = new Set([ANKI_ERROR_COPY[code].heading]);
  for (const platform of ['desktop', 'android'] as const) {
    headings.add(connectFailureCopy(platform, { domain: 'anki', code }, 0).headline);
  }
  return [...headings];
}

export const TROUBLESHOOTING_GROUPS: readonly TroubleshootingGroup[] = [
  {
    id: 'ai',
    title: 'Stories, translations and audio',
    intro:
      'These messages come from OpenRouter. In the reader, the message names what was interrupted, as in “Too many requests while translating this sentence”.',
    entries: [
      ...AI_CODES.map((code) => ({
        seen: [AI_ERROR_COPY[code].heading],
        text: AI_TEXT[code],
        code: `ai/${code}`,
      })),
      CUT_OFF,
    ],
  },
  {
    id: 'anki',
    title: 'Your words and Anki',
    intro:
      'These messages appear when you add or refresh a word source. Your words stay as they were.',
    entries: [
      ...ALL_ANKI_ERROR_CODES.map((code) => ({
        seen: ankiHeadings(code),
        text: ANKI_TEXT[code],
        code: `anki/${code}`,
      })),
      {
        seen: [REFRESH_STORAGE_FAILURE.heading],
        text: "Monosai couldn't save the refreshed words, usually because the device is out of space. Free some space, then refresh again.",
      },
      {
        seen: [REFRESH_LANGUAGE_FAILURE.heading],
        text: "The Japanese dictionary isn't available yet. Check your connection, then try again.",
      },
    ],
  },
  {
    id: 'pages',
    title: "Pages that don't open",
    intro:
      'These messages replace a whole page. The line below the heading says what went wrong, and your saved data is unchanged.',
    entries: [
      {
        seen: ['Your library could not be loaded', 'This story could not be opened'],
        text: "Monosai couldn't read your saved data. Select **Try again**. If it keeps happening, close other Monosai tabs and reload.",
      },
      {
        seen: ['This story is no longer here'],
        text: 'The story was deleted, perhaps in another tab. Nothing else in your library changed.',
      },
      {
        seen: ['Levels could not be loaded', 'Japanese analysis is not ready'],
        text: "The Japanese dictionary isn't available, usually because Monosai hasn't been online since it was installed or updated. Connect to the internet, then select **Try again**.",
      },
      {
        seen: ['Could not save the story'],
        text: 'Your pasted text is still there. Free some space on the device, then try again.',
      },
      {
        seen: ['Monosai could not start'],
        text: "Monosai couldn't open its database. Select **Try again**, or **Reload** if it offers one. If it still fails, select **Save a copy** to keep your data before you try anything else, and report the problem.",
      },
    ],
  },
];

/** Problems that show no message at all, by what the learner notices. */
export const SILENT_PROBLEMS: readonly TroubleshootingEntry[] = [
  {
    seen: ['A story disappeared while it was being written'],
    text: 'Reloading or closing the tab stops a story that is still being written, and nothing is saved. Write it again, and keep the tab open until it appears in your library.',
  },
  {
    seen: ['My words from Anki are out of date'],
    text: "Anki must be open, or Monosai Bridge running, when Monosai refreshes. Open the source in **What you can read** and select **Refresh now**. An Anki export file doesn't update itself: export a new one and select **Replace file**.",
  },
  {
    seen: ['A story opens blank offline'],
    text: "Monosai needs to download its Japanese dictionary once. Open Monosai while you're online, wait a moment, then try again.",
  },
  {
    seen: ['There is no Install Monosai row in Settings'],
    text: "The row appears only while Chrome offers to install Monosai. It's hidden once Monosai is installed, and in browsers that don't offer installation.",
  },
  {
    seen: ["Monosai isn't in AnkiDroid's share menu"],
    text: 'Sharing works only when Monosai is installed from Chrome on Android. Install it, or import the file with **Import from Anki** instead.',
  },
  {
    seen: ['A shared package is rejected'],
    text: 'Share exactly one .apkg or .colpkg file of 512 MB or less. If Android reports low storage, free some space.',
  },
  {
    seen: ["Monosai doesn't offer an update I know exists"],
    text: 'Open **Settings** and select **Check for updates** under **About**.',
  },
];
