import type { AiErrorCode } from '../../../domain/ai/ai-error';
import type { AnkiErrorCode } from '../../../domain/anki/anki-error';
import {
  AI_ERROR_COPY,
  MODERATION_HEADING,
  NO_AUDIO_DECODER_HEADING,
  SPEECH_CODE_HEADING,
} from '../../../shared-ui/ai-error/ai-error-copy';
import {
  ANKI_ERROR_COPY,
  connectFailureCopy,
  REFRESH_LANGUAGE_FAILURE,
  REFRESH_STORAGE_FAILURE,
} from '../../vocabulary/anki-error-copy';

/**
 * One thing that can go wrong, looked up by what the learner sees.
 *
 * `seen` is every wording the screen can show for it, read from the same copy
 * table the failure itself uses wherever one exists, so the guide and the
 * screen cannot drift apart. `text` is the cause and the fix in whole
 * sentences, with three marks: `**control**` in bold, `` `identifier` `` as
 * code, and `[topic](/help/slug)` as a link. `code` is what a bug report
 * carries.
 */
export interface TroubleshootingEntry {
  readonly seen: readonly string[];
  readonly text: string;
  readonly code?: string;
}

export interface TroubleshootingGroup {
  readonly id: string;
  readonly title: string;
  /** Where these messages appear, in one or two sentences. */
  readonly intro: string;
  readonly entries: readonly TroubleshootingEntry[];
}

/** AI failures, most common first. */
const AI_ENTRIES: readonly (readonly [AiErrorCode, string])[] = [
  [
    'credit-exhausted',
    'Your OpenRouter account has run out of credit. Add credit on `openrouter.ai`, then try again.',
  ],
  [
    'authentication',
    "OpenRouter didn't accept your key, because it was deleted or mistyped. Copy the key from `openrouter.ai`, then paste it again in **Settings** > **OpenRouter key**.",
  ],
  [
    'offline',
    "Your device isn't connected to the internet. Reconnect, then try again. Reading and looking up words still work offline.",
  ],
  [
    'rate-limited',
    "OpenRouter or the model's provider is limiting how many requests you can send. Wait a minute, then try again.",
  ],
  [
    'provider-unavailable',
    "OpenRouter or the model's provider is having problems. Try again in a few minutes, or choose another model.",
  ],
  [
    'timeout',
    'OpenRouter took too long to answer. Try again. If it keeps happening, choose a faster model.',
  ],
  [
    'malformed-response',
    'The model answered, but not in a form Monosai can use. This happens most often with small and free models. Try again, or choose another model, as [Choose a text model](/help/text-models) describes.',
  ],
  [
    'capability-unsupported',
    "The model can't answer in the form Monosai needs, or it hasn't passed its test. Choose or test a model in **Settings** > **Text models**. For audio, check the model and voice in **Settings** > **Voice**, then select **Play sample**.",
  ],
  [
    'model-not-found',
    'OpenRouter has no model with that ID, often because it was retired. Choose another one in **Settings** > **Text models** or **Settings** > **Voice**.',
  ],
  [
    'context-budget-exceeded',
    'The request is larger than the model can take, usually because you know many words. Choose a model with a larger context.',
  ],
  [
    'audio-invalid',
    "The speech model sent audio that can't be played. Choose another speech model or voice in **Settings** > **Voice**, then select **Play sample**.",
  ],
  ['cancelled', 'The request stopped before it finished. Start it again.'],
  [
    'unknown',
    'Something unexpected went wrong with the request. Try again. If it keeps happening, report it as described at the end of this page.',
  ],
];

/** Extra wordings of an AI failure outside the shared table. */
const AI_ALSO_SEEN: Partial<Record<AiErrorCode, readonly string[]>> = {
  authentication: ['Key refused'],
};

/** The one AI failure with a heading of its own: the reply, not the request, ran out of room. */
const CUT_OFF: TroubleshootingEntry = {
  seen: ['The reply was cut off'],
  text: 'The model stopped before it finished, usually because it spent its tokens reasoning. Try again, set **Reasoning** lower, or raise the **Token limit** in **Settings** > **Text models**.',
  code: 'ai/context-budget-exceeded',
};

/** A model's moderation check refused the text: the key and the model are fine. */
const FLAGGED: TroubleshootingEntry = {
  seen: [MODERATION_HEADING],
  text: 'OpenRouter checks the text sent to some models, and it flagged this text. Choose another model in **Settings** > **Text models**.',
  code: 'ai/capability-unsupported',
};

/** The app itself, not the request: part of Monosai's code didn't load in this tab. */
const SPEECH_CODE: TroubleshootingEntry = {
  seen: [SPEECH_CODE_HEADING],
  text: "Part of Monosai didn't load, often after an update or on an unsteady connection, and only a reload brings it back. In the reader, open **Story options** and select **Reload**. If a story is being written, Monosai reloads when it's finished. Audio that's already saved still plays.",
  code: 'ai/unknown',
};

/** The browser itself, not the clip: it has nothing to decode audio with. */
const NO_AUDIO_DECODER: TroubleshootingEntry = {
  seen: [NO_AUDIO_DECODER_HEADING],
  text: "This browser has no way to check new audio, so Monosai can't save any. It stops after the first clip, which OpenRouter still charges for. Open Monosai in a current version of Chrome.",
  code: 'ai/unknown',
};

/** Anki failures, most common first. */
const ANKI_ENTRIES: readonly (readonly [AnkiErrorCode, string])[] = [
  [
    'not-running',
    "Anki isn't open, or AnkiConnect isn't installed. Open Anki on this computer, then try again.",
  ],
  [
    'origin-not-allowed',
    "AnkiConnect or Monosai Bridge hasn't been told to answer this address. On a computer, add the address to `webCorsOriginList`, as [Add your words](/help/your-words) describes, and restart Anki. On a computer, this message can also mean that Anki isn't open.",
  ],
  [
    'addon-missing-or-unreachable',
    "Anki is open, but the AnkiConnect add-on didn't answer. Install it with the code `2055492159`, check that it's enabled, and restart Anki.",
  ],
  ['bridge-not-running', 'Open Monosai Bridge and select **Start**, then try again.'],
  [
    'ankidroid-permission-denied',
    "Monosai Bridge isn't allowed to read AnkiDroid. Open Monosai Bridge and select **Allow**.",
  ],
  [
    'ankidroid-not-installed',
    "Monosai Bridge can't find AnkiDroid. Install AnkiDroid 2.24 or later, and open your collection once.",
  ],
  [
    'bridge-too-old',
    'Your Monosai Bridge is too old for this version of Monosai. Update it from the **Updates** row in Monosai Bridge.',
  ],
  [
    'package-review-data-missing',
    'The package has no review history. Export it again with **Include scheduling information** turned on.',
  ],
  [
    'package-unreadable',
    "The file isn't an Anki package, or it's damaged. Export a new `.apkg` or `.colpkg` file from Anki.",
  ],
  [
    'package-schema-unsupported',
    "The package comes from a version of Anki that Monosai doesn't support. Export it again from a current version.",
  ],
  [
    'package-resource-limit',
    'The package is too large to process on this device. Export only the decks you study from.',
  ],
  [
    'review-evidence-unsupported',
    "This connection can't tell which cards you've reviewed. Import an Anki package instead.",
  ],
  [
    'permission-denied',
    "AnkiConnect refused Monosai's request. Allow it in AnkiConnect's settings in Anki, then try again.",
  ],
  [
    'api-key-required',
    "AnkiConnect is set to require an API key, which Monosai doesn't support. Remove the key in AnkiConnect's settings, or import an Anki package instead.",
  ],
  ['timeout', 'Anki took too long to answer. Try again.'],
  [
    'query-failed',
    "Anki couldn't search your reviewed cards. Check the deck and note type, then try again.",
  ],
  ['deck-discovery-failed', "Monosai couldn't read your list of decks. Try again."],
  ['note-type-discovery-failed', "Monosai couldn't read your list of note types. Try again."],
  [
    'field-discovery-failed',
    "Monosai couldn't read the fields of that note type. Choose another note type, or try again.",
  ],
  [
    'unsupported-api',
    "Monosai didn't understand Anki's answer. Update Anki and AnkiConnect, then try again.",
  ],
  [
    'unsupported-action',
    "Your version of Anki or AnkiConnect can't do something Monosai needs. Update both, then try again.",
  ],
  ['malformed-response', "Anki sent an answer Monosai couldn't read. Try again."],
  ['cancelled', 'The refresh stopped before it finished. Refresh again.'],
  ['unknown', 'Something unexpected went wrong. Try again, or import an Anki package instead.'],
];

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
      'These messages appear when a request for a story, plot, translation, grammar note or audio fails. In **Settings**, a failed model test shows the same message after “Test failed”.',
    entries: [
      ...AI_ENTRIES.map(([code, text]) => ({
        seen: [AI_ERROR_COPY[code].heading, ...(AI_ALSO_SEEN[code] ?? [])],
        text,
        code: `ai/${code}`,
      })),
      CUT_OFF,
      FLAGGED,
      SPEECH_CODE,
      NO_AUDIO_DECODER,
    ],
  },
  {
    id: 'writing',
    title: 'Writing a story',
    intro: 'These messages replace the progress of a story that stopped. Nothing was saved.',
    entries: [
      {
        seen: ['This generation is no longer running'],
        text: 'The story stopped because the tab was reloaded or closed while it was being written. Write it again, and keep the tab open until it appears in your library.',
      },
      {
        seen: ['Could not finish the story'],
        text: 'Something went wrong after the story was written. Select **Try again**.',
      },
      {
        seen: ['Could not save'],
        text: "Monosai couldn't save the story to this browser. Close other Monosai tabs and reload. If it still fails, report it before you use **Delete all data**.",
      },
    ],
  },
  {
    id: 'anki',
    title: 'Your words and Anki',
    intro:
      'These messages appear when you add or refresh a word source. Your words stay as they were.',
    entries: [
      ...ANKI_ENTRIES.map(([code, text]) => ({
        seen: ankiHeadings(code),
        text,
        code: `anki/${code}`,
      })),
      {
        seen: [REFRESH_STORAGE_FAILURE.heading],
        text: "Monosai couldn't save the refreshed words, usually because the device is out of space. Free some space, then refresh again.",
      },
      {
        seen: [REFRESH_LANGUAGE_FAILURE.heading],
        text: "The Japanese dictionary isn't available. Connect to the internet, then try again.",
      },
    ],
  },
  {
    id: 'reading',
    title: 'Reading and adding text',
    intro: 'These messages appear inside a page, beside what failed.',
    entries: [
      {
        seen: ['Dictionary unavailable.'],
        text: "Monosai hasn't downloaded its Japanese dictionary yet. Open Monosai while you're online, wait a moment, then look the word up again.",
      },
      {
        seen: ['Could not save: …'],
        text: "A translation, note or audio clip couldn't be saved, usually because the device is out of space. Free some space, or delete saved audio in **Settings**, then try again.",
      },
      {
        seen: ['Japanese analysis is not ready'],
        text: "The Japanese dictionary isn't available yet. Connect to the internet, then select **Try again**. Your text is still there.",
      },
      {
        seen: ['Could not save the story'],
        text: "Your pasted text couldn't be saved. The line after the message says why; most often the device is out of space. Your text is still there.",
      },
      {
        seen: ['Could not save. Your level is unchanged.'],
        text: "Your reading level couldn't be saved. Close other Monosai tabs, then select **Save level** again.",
      },
    ],
  },
  {
    id: 'pages',
    title: "Pages that don't open",
    intro: 'These messages replace a whole page, or appear as a banner at the top.',
    entries: [
      {
        seen: ['Your library could not be loaded', 'This story could not be opened'],
        text: "Monosai couldn't read your saved data. Select **Try again**. If it keeps happening, close other Monosai tabs and reload.",
      },
      {
        seen: ['This story is no longer here', 'Story not found'],
        text: 'The story was deleted, or the link is wrong. Nothing else in your library changed.',
      },
      {
        seen: ['Levels could not be loaded'],
        text: "The Japanese dictionary isn't available, usually because Monosai hasn't been online since it was installed or updated. Connect to the internet, then select **Try again**.",
      },
      {
        seen: ['Monosai could not start'],
        text: "Monosai couldn't open your saved data. Select **Try again**, or **Reload** if it's offered. If the page offers **Save a copy**, select it before you try anything else, then report the problem.",
      },
      {
        seen: [
          'Monosai was updated or reset in another tab, so this tab can no longer save.',
          'Monosai lost its connection to your saved data, so this tab can no longer save.',
        ],
        text: 'Select **Reload**. Anything this tab had already saved is safe.',
      },
    ],
  },
];

/** Problems that show no message at all, by what the learner notices. */
export const SILENT_PROBLEMS: readonly TroubleshootingEntry[] = [
  {
    seen: ['Your words from Anki are out of date'],
    text: "Anki must be open, or Monosai Bridge running, when Monosai refreshes. Open the source in **Words** and select **Refresh now**. An Anki package doesn't update itself: export a new one and select **Replace file**.",
  },
  {
    seen: ["There's no Install Monosai row in Settings"],
    text: 'The row appears only while Chrome offers to install Monosai, as [Install and use offline](/help/install) explains.',
  },
  {
    seen: ["Monosai isn't in AnkiDroid's share menu"],
    text: 'Sharing works only when Monosai is installed from Chrome on Android. Install it, or select **Import from Anki** in Monosai instead.',
  },
  {
    seen: ["Monosai doesn't have a change you know was released"],
    text: 'Close Monosai and open it again. Monosai downloads a new version in the background, so it can take two opens before you see it.',
  },
];
