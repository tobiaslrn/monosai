import type { IconName } from '../../shared-ui/icon/icon-set';

/**
 * The topics the guide answers, in the order a first-time learner asks them.
 *
 * The union is the source: the route table maps it to one lazy page each, so a
 * topic added here without a page, or a page without a topic, is a type error
 * rather than a row that leads nowhere.
 */
export type HelpTopicSlug =
  | 'get-started'
  | 'your-words'
  | 'reading-level'
  | 'write'
  | 'reading'
  | 'text-models'
  | 'voice'
  | 'install'
  | 'privacy'
  | 'questions'
  | 'troubleshooting';

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
    slug: 'get-started',
    title: 'Get started',
    summary: 'What you need, first story',
    icon: 'prepare',
  },
  {
    slug: 'your-words',
    title: 'Add your words',
    summary: 'Anki, AnkiDroid, iPhone, lists',
    icon: 'anki-source',
  },
  {
    slug: 'reading-level',
    title: 'Reading level',
    summary: 'Grammar levels and JLPT',
    icon: 'reading-level',
  },
  {
    slug: 'write',
    title: 'Write a story',
    summary: 'Words, direction, plot, cost',
    icon: 'generate',
  },
  {
    slug: 'reading',
    title: 'Read a story',
    summary: 'Lookup, furigana, translation, audio',
    icon: 'vocabulary',
  },
  {
    slug: 'text-models',
    title: 'Choose a text model',
    summary: 'Models, prices, reasoning',
    icon: 'aids',
  },
  {
    slug: 'voice',
    title: 'Set up audio',
    summary: 'Speech models, voices, cost',
    icon: 'audio',
  },
  {
    slug: 'install',
    title: 'Install and use offline',
    summary: 'Install, offline, updates',
    icon: 'settings',
  },
  {
    slug: 'privacy',
    title: 'Privacy and your data',
    summary: 'Your key, storage, deleting',
    icon: 'hide',
  },
  {
    slug: 'questions',
    title: 'Common questions',
    summary: 'Cost, iPhone, privacy, bugs',
    icon: 'help',
  },
  {
    slug: 'troubleshooting',
    title: 'Fix a problem',
    summary: 'Error messages and fixes',
    icon: 'warning',
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
