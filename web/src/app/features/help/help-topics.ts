import type { IconName } from '../../shared-ui/icon/icon-set';

/**
 * The topics the guide answers, in the order a first-time learner asks them.
 *
 * The union is the source: the route table maps it to one lazy page each, so a
 * topic added here without a page, or a page without a topic, is a type error
 * rather than a row that leads nowhere.
 */
export type HelpTopicSlug =
  'first-steps' | 'your-words' | 'reading' | 'text-models' | 'voice' | 'install' | 'questions';

/**
 * One topic in the guide.
 *
 * The hub shelf, the route table, and the footer of every topic page read this
 * list, so a topic cannot be listed in one place and missing from another.
 * `summary` is what the row says the topic answers, in the learner's words.
 */
export interface HelpTopic {
  /** The path segment under `/help`, and the topic's identity. */
  readonly slug: HelpTopicSlug;
  readonly title: string;
  readonly summary: string;
  readonly icon: IconName;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    slug: 'first-steps',
    title: 'First steps',
    summary: 'From an empty library to your first story.',
    icon: 'prepare',
  },
  {
    slug: 'your-words',
    title: 'Your words',
    summary: 'Anki, the Android bridge, files, and pasted lists.',
    icon: 'anki-source',
  },
  {
    slug: 'reading',
    title: 'Reading a story',
    summary: 'Lookup, furigana, markers, and audio in the reader.',
    icon: 'vocabulary',
  },
  {
    slug: 'text-models',
    title: 'Choosing a text model',
    summary: 'What weak models get wrong, and what to pick.',
    icon: 'generate',
  },
  {
    slug: 'voice',
    title: 'Voice and audio',
    summary: 'Which speech model to use, what it costs, and what it misreads.',
    icon: 'audio',
  },
  {
    slug: 'install',
    title: 'Installing and offline',
    summary: 'Install it, read offline, and where your data lives.',
    icon: 'settings',
  },
  {
    slug: 'questions',
    title: 'Common questions',
    summary: 'Cost, privacy, limits, and when something fails.',
    icon: 'info',
  },
] as const;

/** The topic before and after this one, for reading the guide straight through. */
export function adjacentHelpTopics(slug: string): {
  readonly previous: HelpTopic | null;
  readonly next: HelpTopic | null;
} {
  const index = HELP_TOPICS.findIndex((topic) => topic.slug === slug);
  if (index < 0) {
    return { previous: null, next: null };
  }
  return {
    previous: HELP_TOPICS[index - 1] ?? null,
    next: HELP_TOPICS[index + 1] ?? null,
  };
}
