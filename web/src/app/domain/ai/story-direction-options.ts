/**
 * What a learner can steer a story with, and the turning points code rolls.
 *
 * This is content, not behaviour, and it is kept apart from the rules in
 * `story-direction.ts` so it can be reviewed and extended on its own, the way
 * the structural baseline is. Every label is an English UI string in sentence
 * case and doubles as the value sent to the plot model.
 *
 * The beginner rule decides what belongs here: a story may only use the
 * learner's own words, so every option has to be tellable with everyday ones.
 * Science fiction, time travel, superheroes, fantasy, heists, survival, ghosts
 * and horror, robots, fables, news reports, and cliffhangers are left out
 * because none of them can be written for a learner with a few hundred words.
 */

/** The seven axes, in the order the Direction step lists them. */
export const STORY_AXES = ['genre', 'mood', 'setting', 'cast', 'format', 'ending', 'time'] as const;

export type StoryAxis = (typeof STORY_AXES)[number];

export const STORY_AXIS_LABELS: Readonly<Record<StoryAxis, string>> = {
  genre: 'Genre',
  mood: 'Mood',
  setting: 'Setting',
  cast: 'Cast',
  format: 'Format',
  ending: 'Ending',
  time: 'Time',
};

export const STORY_DIRECTION_OPTIONS: Readonly<Record<StoryAxis, readonly string[]>> = {
  genre: [
    'Slice of life',
    'Mystery',
    'Drama',
    'Comedy',
    'Adventure',
    'Action',
    'Romance',
    'Folk tale',
    'Fairy tale',
    'Friendship',
    'Family',
    'Growing up',
    'Work life',
    'School life',
    'Sports',
    'Food',
    'Travel',
    'Music',
    'Nature',
    'Animal tale',
    'Misunderstanding',
    'Lost and found',
    'Helping others',
    'Rivalry',
  ],
  mood: [
    'Light',
    'Calm',
    'Warm',
    'Funny',
    'Tense',
    'Sad',
    'Hopeful',
    'Lonely',
    'Playful',
    'Nostalgic',
    'Mysterious',
    'Cozy',
    'Dreamy',
    'Excited',
    'Bittersweet',
    'Peaceful',
    'Awkward',
    'Heartwarming',
    'Busy',
    'Determined',
  ],
  setting: [
    'Home',
    'School',
    'Town',
    'Station',
    'Countryside',
    'Restaurant',
    'Work',
    'Nature',
    'Trip',
    'Park',
    'Beach',
    'Mountain',
    'Library',
    'Shop',
    'Hospital',
    'Festival',
    'Train',
    'Cafe',
    'Airport',
    'Hot spring',
    'Rooftop',
    'Convenience store',
    'Shrine',
    'Market',
    'Bus stop',
    'Forest',
    'Neighbourhood',
    'Bookstore',
    'Museum',
    'Bakery',
  ],
  cast: [
    'One person',
    'Two friends',
    'Family',
    'Child',
    'Coworkers',
    'Stranger',
    'Animal',
    'Teacher and student',
    'Grandparent',
    'Neighbours',
    'Siblings',
    'Group of friends',
    'Couple',
    'Boss and employee',
    'Shopkeeper',
    'Traveller',
    'Classmates',
    'Twins',
    'Old friends',
    'Mother and child',
  ],
  format: [
    'Narrated',
    'Dialogue',
    'Diary',
    'Letter',
    'Message thread',
    'Monologue',
    'Postcard',
    'Interview',
  ],
  ending: [
    'Happy',
    'Bittersweet',
    'Open',
    'Twist',
    'Hopeful',
    'Quiet',
    'Funny',
    'Sad',
    'Warm',
    'Surprising',
  ],
  time: [
    'Rainy day',
    'Summer festival',
    'Night',
    'New Year',
    'Morning',
    'Winter',
    'Spring',
    'Holiday',
    'Sunset',
    'Typhoon day',
    'Birthday',
    'Last day of school',
    'Autumn',
    'Snowy day',
    'Lunch break',
    'Weekend',
    'Golden Week',
    'Early morning',
    'Late night',
    'First day',
  ],
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
];

/** How many choices an axis holds at once. A third genre replaces the oldest. */
export const STORY_AXIS_LIMITS: Readonly<Record<StoryAxis, number>> = {
  genre: 2,
  mood: 1,
  setting: 1,
  cast: 1,
  format: 1,
  ending: 1,
  time: 1,
};

/**
 * The axes code fills for a card when the learner left them on Any.
 *
 * These four decide what a story is about, so leaving them open has to give
 * three different stories. Format, ending, and time are left to the writer
 * when nobody chose them: they change how a story is told, not what it is.
 */
export const ROLLED_STORY_AXES: readonly StoryAxis[] = ['genre', 'mood', 'setting', 'cast'];

/** The longest custom option, in characters. */
export const MAX_CUSTOM_OPTION_LENGTH = 40;
