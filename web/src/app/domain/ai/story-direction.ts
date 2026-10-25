import { err, ok, type Result } from '../shared/result';
import { sampleWithoutReplacement, type RandomSource } from '../shared/random';
import { countCodePoints } from './story-request';
import {
  MAX_CUSTOM_OPTION_LENGTH,
  ROLLED_STORY_AXES,
  STORY_AXES,
  STORY_AXIS_LIMITS,
  STORY_DIRECTION_OPTIONS,
  TURNING_POINTS,
  type StoryAxis,
  type TurningPoint,
} from './story-direction-options';

/** How many plots one draft offers. */
export const PLOT_COUNT = 3;

type PerAxis<T> = Readonly<Record<StoryAxis, T>>;

/**
 * What the learner chose on the Direction step.
 *
 * Every axis is a list, oldest choice first, so a genre's two choices and a
 * mood's one share one shape. An empty list is Any. Custom options are kept per
 * axis in the order they were added, after the built-in ones, so a choice the
 * learner typed stays in its row and nothing reorders when it is picked.
 */
export interface StoryDirection {
  readonly selected: PerAxis<readonly string[]>;
  readonly custom: PerAxis<readonly string[]>;
}

function perAxis<T>(value: (axis: StoryAxis) => T): PerAxis<T> {
  return Object.fromEntries(STORY_AXES.map((axis) => [axis, value(axis)])) as Record<StoryAxis, T>;
}

export const EMPTY_STORY_DIRECTION: StoryDirection = {
  selected: perAxis(() => []),
  custom: perAxis(() => []),
};

/** The options one axis offers, in the stable order the step shows them. */
export function axisOptions(direction: StoryDirection, axis: StoryAxis): readonly string[] {
  return [...STORY_DIRECTION_OPTIONS[axis], ...direction.custom[axis]];
}

/** Whether a value on this axis is one the learner typed. */
export function isCustomOption(direction: StoryDirection, axis: StoryAxis, value: string): boolean {
  return direction.custom[axis].includes(value);
}

function withSelection(
  direction: StoryDirection,
  axis: StoryAxis,
  selection: readonly string[],
): StoryDirection {
  return { ...direction, selected: { ...direction.selected, [axis]: selection } };
}

/**
 * Picks or unpicks one option.
 *
 * Picking a chosen option again clears it. Past the axis limit the oldest
 * choice goes, so a third genre replaces the first rather than being refused.
 */
export function toggleOption(
  direction: StoryDirection,
  axis: StoryAxis,
  value: string,
): StoryDirection {
  const current = direction.selected[axis];
  if (current.includes(value)) {
    return withSelection(
      direction,
      axis,
      current.filter((chosen) => chosen !== value),
    );
  }
  if (!axisOptions(direction, axis).includes(value)) {
    return direction;
  }
  return withSelection(direction, axis, [...current, value].slice(-STORY_AXIS_LIMITS[axis]));
}

/** Puts one axis back on Any. */
export function clearAxis(direction: StoryDirection, axis: StoryAxis): StoryDirection {
  return withSelection(direction, axis, []);
}

export type CustomOptionIssue = 'empty' | 'too-long';

/** Collapses the whitespace a learner may have typed or pasted. */
export function normalizeCustomOption(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Adds a learner-typed option to an axis and picks it.
 *
 * Text that already names an option on this axis, in any letter case, picks
 * that option instead of adding a second chip that says the same thing.
 */
export function addCustomOption(
  direction: StoryDirection,
  axis: StoryAxis,
  text: string,
): Result<StoryDirection, CustomOptionIssue> {
  const value = normalizeCustomOption(text);
  if (value === '') {
    return err('empty');
  }
  if (countCodePoints(value) > MAX_CUSTOM_OPTION_LENGTH) {
    return err('too-long');
  }
  const existing = axisOptions(direction, axis).find(
    (option) => option.toLocaleLowerCase('en') === value.toLocaleLowerCase('en'),
  );
  const added =
    existing === undefined
      ? {
          ...direction,
          custom: { ...direction.custom, [axis]: [...direction.custom[axis], value] },
        }
      : direction;
  const chosen = existing ?? value;
  if (added.selected[axis].includes(chosen)) {
    return ok(added);
  }
  return ok(toggleOption(added, axis, chosen));
}

/**
 * Fills every axis at random from the built-in options.
 *
 * One or two genres, one of everything else. The learner's custom options stay
 * in their rows; they are just not drawn, because Surprise me is a way to see
 * what the lists hold.
 */
export function surpriseDirection(direction: StoryDirection, random: RandomSource): StoryDirection {
  return {
    ...direction,
    selected: perAxis((axis) => {
      const size = axis === 'genre' ? 1 + random.nextInt(STORY_AXIS_LIMITS.genre) : 1;
      return sampleWithoutReplacement(STORY_DIRECTION_OPTIONS[axis], size, random);
    }),
  };
}

/** One value on a plot card, and whether the learner or code chose it. */
export interface FrameValue {
  readonly value: string;
  readonly rolled: boolean;
}

/**
 * Everything one plot card is built on.
 *
 * Pinned axes carry the learner's choice on every card. Axes left on Any are
 * rolled per card for the four that decide what a story is about, and stay
 * empty for the rest. The turning point is always rolled.
 */
export interface PlotFrame {
  readonly values: PerAxis<readonly FrameValue[]>;
  readonly turningPoint: TurningPoint;
}

/**
 * Draws `count` values from `pool`, avoiding `used` while it can.
 *
 * Distinct across the cards is the point, but a small pool must not leave a
 * card without a value, so a shortfall is made up from the whole pool.
 */
function drawDistinct<T>(
  pool: readonly T[],
  used: readonly T[],
  count: number,
  random: RandomSource,
): readonly T[] {
  const drawn = [
    ...sampleWithoutReplacement(
      pool.filter((item) => !used.includes(item)),
      count,
      random,
    ),
  ];
  while (drawn.length < count && pool.length > 0) {
    const unused = pool.filter((item) => !drawn.includes(item));
    drawn.push(
      ...sampleWithoutReplacement(unused.length > 0 ? unused : pool, count - drawn.length, random),
    );
  }
  return drawn;
}

/**
 * Builds the frames for one draft of plots.
 *
 * `kept` holds one entry per card: a frame to keep as it is — a plot the
 * learner edited — or null for a card to roll again. Rolled values are distinct
 * across the cards being rolled and avoid what the kept cards already use, so
 * three cards left entirely on Any are three different stories, and three cards
 * with everything pinned still differ in their turning point.
 */
export function rollPlotFrames(
  direction: StoryDirection,
  random: RandomSource,
  kept: readonly (PlotFrame | null)[] = Array.from({ length: PLOT_COUNT }, () => null),
): readonly PlotFrame[] {
  const keptFrames = kept.filter((frame): frame is PlotFrame => frame !== null);
  const rolling = kept.length - keptFrames.length;

  const rolledValues = perAxis((axis) => {
    if (!ROLLED_STORY_AXES.includes(axis) || direction.selected[axis].length > 0) {
      return [];
    }
    const used = keptFrames.flatMap((frame) =>
      frame.values[axis].filter((value) => value.rolled).map((value) => value.value),
    );
    return drawDistinct(STORY_DIRECTION_OPTIONS[axis], used, rolling, random);
  });
  const turningPoints = drawDistinct(
    TURNING_POINTS,
    keptFrames.map((frame) => frame.turningPoint),
    rolling,
    random,
  );

  let next = 0;
  return kept.map((frame) => {
    if (frame !== null) {
      return frame;
    }
    const index = next;
    next += 1;
    return {
      values: perAxis((axis) => {
        const pinned = direction.selected[axis];
        if (pinned.length > 0) {
          return pinned.map((value) => ({ value, rolled: false }));
        }
        const rolled = rolledValues[axis].at(index);
        return rolled === undefined ? [] : [{ value: rolled, rolled: true }];
      }),
      turningPoint: turningPoints[index],
    };
  });
}

/**
 * Brings a kept card's frame up to date with the learner's current choices.
 *
 * A plot the learner edited survives a change of direction, and its frame is
 * what the story is told to follow, so the frame has to say what the learner
 * chose now. A pinned axis takes its new value; a value code rolled stays while
 * its axis is still on Any; a value the learner has since put back on Any goes,
 * because nobody chose it any more. The turning point is part of the plot and
 * stays.
 */
export function reframePlot(frame: PlotFrame, direction: StoryDirection): PlotFrame {
  return {
    ...frame,
    values: perAxis((axis) => {
      const pinned = direction.selected[axis];
      if (pinned.length > 0) {
        return pinned.map((value) => ({ value, rolled: false }));
      }
      return frame.values[axis].filter((value) => value.rolled);
    }),
  };
}

/**
 * What a saved story records about how its plot was chosen.
 *
 * The learner's choices and the card that was picked are both kept, because
 * the card alone cannot say which of its values were rolled and the choices
 * alone cannot say what was rolled for them. Custom values are named apart:
 * they are the learner's own words and are only ever sent as data.
 */
export interface StoryDirectionRecord {
  /** The learner's choices per axis. An absent axis was left on Any. */
  readonly selected: Readonly<Partial<Record<StoryAxis, readonly string[]>>>;
  /** Which chosen values the learner typed. Absent when none were. */
  readonly customSelected?: Readonly<Partial<Record<StoryAxis, readonly string[]>>>;
  /** The chosen card: every value it showed, and whether code rolled it. */
  readonly frame: Readonly<Partial<Record<StoryAxis, readonly FrameValue[]>>>;
  readonly turningPoint: string;
  /** The plot sent as the premise, including any edit. */
  readonly plotEn: string;
  /** What the model drafted, kept only when the learner changed it. */
  readonly draftedPlotEn?: string;
}

function compact<T>(
  values: PerAxis<readonly T[]>,
): Readonly<Partial<Record<StoryAxis, readonly T[]>>> {
  return Object.fromEntries(
    STORY_AXES.flatMap((axis) => (values[axis].length > 0 ? [[axis, values[axis]]] : [])),
  );
}

/** The record for one generation, from the choices and the card picked. */
export function storyDirectionRecord(
  direction: StoryDirection,
  frame: PlotFrame,
  plotEn: string,
  draftedPlotEn: string,
): StoryDirectionRecord {
  const customSelected = compact(
    perAxis((axis) =>
      direction.selected[axis].filter((value) => isCustomOption(direction, axis, value)),
    ),
  );
  return {
    selected: compact(direction.selected),
    ...(Object.keys(customSelected).length === 0 ? {} : { customSelected }),
    frame: compact(frame.values),
    turningPoint: frame.turningPoint.label,
    plotEn,
    ...(plotEn === draftedPlotEn ? {} : { draftedPlotEn }),
  };
}
