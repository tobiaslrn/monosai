/**
 * What a learner can steer a story with, and the turning points code rolls.
 *
 * This is content, not behaviour, and it is kept apart from the rules in
 * `story-direction.ts` so it can be reviewed and extended on its own, the way
 * the structural baseline is. Every label is an English UI string in sentence
 * case and doubles as the value sent to the plot model.
 *
 * Each axis answers one question: what kind of story, what it is about, where
 * it happens, how it feels and ends, who is in it, and how it is told. Two
 * axes must not share an option, so a learner never picks the same thing twice.
 *
 * The beginner rule decides what belongs here: a story may only use the
 * learner's own words, so every option has to be tellable with everyday ones.
 * Science fiction, time travel, superheroes, fantasy, heists, survival, ghosts
 * and horror, robots, news reports, and cliffhangers are left out because none
 * of them can be written for a learner with a few hundred words. Folk tales
 * stay in: they are told in the plainest words there are, and graded readers
 * open with them too. Old Japan stays in for the same reason, and Abroad because
 * a trip is told with travel words a learner already has.
 */

/** The six axes, in the order the Direction step lists them. */
export const STORY_AXES = ['genre', 'topic', 'setting', 'mood', 'cast', 'format'] as const;

export type StoryAxis = (typeof STORY_AXES)[number];

export const STORY_AXIS_LABELS: Readonly<Record<StoryAxis, string>> = {
  genre: 'Genre',
  topic: 'Topic',
  setting: 'Setting',
  mood: 'Mood',
  cast: 'Cast',
  format: 'Format',
};

export const STORY_DIRECTION_OPTIONS: Readonly<Record<StoryAxis, readonly string[]>> = {
  genre: ['Slice of life', 'Comedy', 'Mystery', 'Adventure', 'Romance', 'Drama', 'Folk tale'],
  topic: [
    'Food',
    'Work',
    'School',
    'Travel',
    'Shopping',
    'Sports',
    'Music and art',
    'Animals',
    'Nature and weather',
    'Festivals and seasons',
    'Health',
  ],
  setting: [
    'Home',
    'Neighbourhood',
    'Big city',
    'Countryside',
    'Seaside',
    'Mountains and forest',
    'Old Japan',
    'Abroad',
  ],
  mood: [
    'Heartwarming',
    'Funny',
    'Cozy',
    'Exciting',
    'Tense',
    'Mysterious',
    'Bittersweet',
    'Sad',
    'Hopeful',
    'Twist ending',
  ],
  cast: [
    'One person',
    'Friends',
    'Couple',
    'Family',
    'Parent and child',
    'Siblings',
    'Grandparent and grandchild',
    'Classmates',
    'Coworkers',
    'Teacher and student',
    'Strangers',
    'Animal',
  ],
  format: ['Narrated', 'Mostly dialogue', 'Diary', 'Chat messages', 'Letter or email'],
};

/**
 * One event that turns a plot, rolled by code for every card.
 *
 * The learner cannot pin it: it is what keeps three plots apart even when every
 * axis is pinned. The label is what the card shows; the meaning is what the
 * plot model is told, because a two-word label alone is easy to misread.
 */
export interface TurningPoint {
  readonly label: string;
  readonly meaning: string;
}

export const TURNING_POINTS: readonly TurningPoint[] = [
  { label: 'Lost item', meaning: 'something important goes missing' },
  { label: 'Visitor', meaning: 'someone arrives unexpectedly with a request' },
  { label: 'Mistake', meaning: 'a small mistake changes the plan' },
  { label: 'Decision', meaning: 'someone has to make a choice before the day ends' },
  { label: 'Misunderstanding', meaning: 'two people understand the same thing differently' },
  { label: 'Delay', meaning: 'something is late and the plan has to change' },
  { label: 'Gift', meaning: 'an unexpected present arrives' },
  { label: 'Old message', meaning: 'an old letter, note, or photo is found' },
  { label: 'Found item', meaning: 'someone finds a thing that belongs to somebody else' },
  { label: 'Invitation', meaning: 'someone is invited somewhere and is unsure about going' },
  { label: 'Getting lost', meaning: 'someone loses their way' },
  { label: 'Something breaks', meaning: 'a thing someone needs stops working' },
  { label: 'Phone call', meaning: 'a call brings news that changes the day' },
  { label: 'Secret', meaning: 'someone is keeping a small secret' },
  { label: 'Promise', meaning: 'someone has made a promise that is hard to keep' },
  { label: 'Sudden weather', meaning: 'the weather changes and spoils a plan' },
  { label: 'Asking for help', meaning: 'someone has to ask another person for help' },
  { label: 'Mix-up', meaning: 'two things or two people get swapped' },
  { label: 'Overheard words', meaning: 'someone hears something that was not meant for them' },
  { label: 'First try', meaning: 'someone does something for the first time' },
  { label: 'Strange discovery', meaning: 'someone finds something odd that nobody can explain' },
  { label: 'Contest', meaning: 'two or more people compete for the same prize' },
];

/** How many choices an axis holds at once. A third genre replaces the oldest. */
export const STORY_AXIS_LIMITS: Readonly<Record<StoryAxis, number>> = {
  genre: 2,
  topic: 1,
  setting: 1,
  mood: 1,
  cast: 1,
  format: 1,
};

/**
 * The axes code fills for a card when the learner left them on Any.
 *
 * Genre, topic, setting, and cast decide what a story is about, so leaving them
 * open has to give three different stories. Mood and format change how a story
 * is told, not what it is: they are left to the writer when nobody chose them.
 */
export const ROLLED_STORY_AXES: readonly StoryAxis[] = ['genre', 'topic', 'setting', 'cast'];

/** The longest custom option, in characters. */
export const MAX_CUSTOM_OPTION_LENGTH = 40;
