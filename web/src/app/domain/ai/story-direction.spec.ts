import { describe, expect, it } from 'vitest';
import type { RandomSource } from '../shared/random';
import {
  EMPTY_STORY_DIRECTION,
  PLOT_COUNT,
  addCustomOption,
  axisOptions,
  clearAxis,
  reframePlot,
  rollPlotFrames,
  storyDirectionRecord,
  surpriseDirection,
  toggleOption,
  type PlotFrame,
  type StoryDirection,
} from './story-direction';
import {
  ROLLED_STORY_AXES,
  STORY_AXES,
  STORY_DIRECTION_OPTIONS,
  TURNING_POINTS,
} from './story-direction-options';

/** A small deterministic generator, so a roll is pinned and still varied. */
function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    nextInt: (exclusiveMax) => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) % exclusiveMax;
    },
  };
}

function pick(direction: StoryDirection, ...choices: [string, string][]): StoryDirection {
  return choices.reduce(
    (current, [axis, value]) => toggleOption(current, axis as never, value),
    direction,
  );
}

function valuesOf(frames: readonly PlotFrame[], axis: (typeof STORY_AXES)[number]): string[] {
  return frames.map((frame) => frame.values[axis].map((value) => value.value).join('+'));
}

describe('toggleOption', () => {
  it('keeps at most two genres, replacing the oldest with a third', () => {
    const direction = pick(
      EMPTY_STORY_DIRECTION,
      ['genre', 'Mystery'],
      ['genre', 'Comedy'],
      ['genre', 'Drama'],
    );
    expect(direction.selected.genre).toEqual(['Comedy', 'Drama']);
  });

  it('makes every other axis single-choice and clears a choice picked again', () => {
    let direction = pick(EMPTY_STORY_DIRECTION, ['mood', 'Cozy'], ['mood', 'Tense']);
    expect(direction.selected.mood).toEqual(['Tense']);
    direction = toggleOption(direction, 'mood', 'Tense');
    expect(direction.selected.mood).toEqual([]);
  });

  it('ignores a value the axis does not offer', () => {
    expect(toggleOption(EMPTY_STORY_DIRECTION, 'mood', 'Robot')).toBe(EMPTY_STORY_DIRECTION);
  });

  it('puts an axis back on Any', () => {
    const direction = clearAxis(pick(EMPTY_STORY_DIRECTION, ['genre', 'Mystery']), 'genre');
    expect(direction.selected.genre).toEqual([]);
  });
});

describe('addCustomOption', () => {
  it('normalizes the text, appends it after the built-in options, and picks it', () => {
    const added = addCustomOption(
      EMPTY_STORY_DIRECTION,
      'setting',
      '  my   grandmother’s  kitchen ',
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const options = axisOptions(added.value, 'setting');
    expect(options.at(-1)).toBe('my grandmother’s kitchen');
    expect(options.slice(0, -1)).toEqual(STORY_DIRECTION_OPTIONS.setting);
    expect(added.value.selected.setting).toEqual(['my grandmother’s kitchen']);
  });

  it('picks an existing option rather than adding the same words twice', () => {
    const added = addCustomOption(EMPTY_STORY_DIRECTION, 'mood', 'cozy');
    expect(added.ok && added.value.custom.mood).toEqual([]);
    expect(added.ok && added.value.selected.mood).toEqual(['Cozy']);
  });

  it('refuses empty text and text longer than a chip', () => {
    expect(addCustomOption(EMPTY_STORY_DIRECTION, 'mood', '   ')).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(addCustomOption(EMPTY_STORY_DIRECTION, 'mood', 'a'.repeat(41))).toEqual({
      ok: false,
      error: 'too-long',
    });
    expect(addCustomOption(EMPTY_STORY_DIRECTION, 'mood', 'a'.repeat(40)).ok).toBe(true);
  });
});

describe('surpriseDirection', () => {
  it('fills every axis from the built-in lists, with one or two genres', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const surprised = surpriseDirection(EMPTY_STORY_DIRECTION, seeded(seed));
      for (const axis of STORY_AXES) {
        const chosen = surprised.selected[axis];
        expect(chosen.length).toBeGreaterThanOrEqual(1);
        expect(chosen.length).toBeLessThanOrEqual(axis === 'genre' ? 2 : 1);
        for (const value of chosen) {
          expect(STORY_DIRECTION_OPTIONS[axis]).toContain(value);
        }
      }
    }
  });

  it('keeps the learner’s custom options in their rows', () => {
    const added = addCustomOption(EMPTY_STORY_DIRECTION, 'cast', 'My cat Mochi');
    if (!added.ok) throw new Error('fixture');
    expect(surpriseDirection(added.value, seeded(1)).custom.cast).toEqual(['My cat Mochi']);
  });
});

describe('rollPlotFrames', () => {
  it('gives three different frames when everything is left on Any', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const frames = rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(seed));
      expect(frames).toHaveLength(PLOT_COUNT);
      for (const axis of ROLLED_STORY_AXES) {
        expect(new Set(valuesOf(frames, axis)).size).toBe(PLOT_COUNT);
        for (const frame of frames) {
          expect(frame.values[axis]).toHaveLength(1);
          expect(frame.values[axis][0].rolled).toBe(true);
        }
      }
      // Mood and format are left to the writer when nobody chose them.
      for (const axis of ['mood', 'format'] as const) {
        expect(frames.every((frame) => frame.values[axis].length === 0)).toBe(true);
      }
      expect(new Set(frames.map((frame) => frame.turningPoint.label)).size).toBe(PLOT_COUNT);
    }
  });

  it('repeats a pinned axis on every card and still differs in the turning point', () => {
    let direction = EMPTY_STORY_DIRECTION;
    for (const axis of STORY_AXES) {
      direction = toggleOption(direction, axis, STORY_DIRECTION_OPTIONS[axis][0]);
    }
    direction = toggleOption(direction, 'genre', 'Comedy');

    const frames = rollPlotFrames(direction, seeded(3));
    for (const axis of STORY_AXES) {
      expect(new Set(valuesOf(frames, axis)).size).toBe(1);
      expect(frames[0].values[axis].every((value) => !value.rolled)).toBe(true);
    }
    expect(frames[0].values.genre.map((value) => value.value)).toEqual(['Slice of life', 'Comedy']);
    expect(new Set(frames.map((frame) => frame.turningPoint.label)).size).toBe(PLOT_COUNT);
  });

  it('is pinned by the random source, so the same seed rolls the same frames', () => {
    expect(rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(42))).toEqual(
      rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(42)),
    );
    expect(rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(42))).not.toEqual(
      rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(43)),
    );
  });

  it('keeps a kept frame in its place and rolls the others clear of it', () => {
    const first = rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(7));
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const again = rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(seed), [null, first[1], null]);
      expect(again[1]).toBe(first[1]);
      for (const axis of ROLLED_STORY_AXES) {
        expect(new Set(valuesOf(again, axis)).size).toBe(PLOT_COUNT);
      }
      expect(new Set(again.map((frame) => frame.turningPoint.label)).size).toBe(PLOT_COUNT);
    }
  });

  it('never leaves a card without a value, even when the pool runs short', () => {
    const always: RandomSource = { nextInt: () => 0 };
    const frames = rollPlotFrames(
      EMPTY_STORY_DIRECTION,
      always,
      Array.from({ length: TURNING_POINTS.length + 2 }, () => null),
    );
    for (const frame of frames) {
      expect(frame.turningPoint).toBeDefined();
    }
    expect(frames.every((frame) => frame.values.genre.length === 1)).toBe(true);
  });
});

describe('reframePlot', () => {
  it('takes new pins, keeps rolled values on Any axes, and drops choices put back on Any', () => {
    const pinned = pick(EMPTY_STORY_DIRECTION, ['mood', 'Cozy'], ['topic', 'Food']);
    const [frame] = rollPlotFrames(pinned, seeded(5));

    const now = pick(EMPTY_STORY_DIRECTION, ['topic', 'Work']);
    const reframed = reframePlot(frame, now);

    expect(reframed.values.topic).toEqual([{ value: 'Work', rolled: false }]);
    expect(reframed.values.mood).toEqual([]);
    expect(reframed.values.setting).toEqual(frame.values.setting);
    expect(reframed.turningPoint).toBe(frame.turningPoint);
  });
});

describe('storyDirectionRecord', () => {
  it('records the choices, the custom values, the picked card, and the plot as sent', () => {
    const added = addCustomOption(
      pick(EMPTY_STORY_DIRECTION, ['genre', 'Mystery'], ['mood', 'Funny']),
      'cast',
      'My cat Mochi',
    );
    if (!added.ok) throw new Error('fixture');
    const [frame] = rollPlotFrames(added.value, seeded(9));

    const record = storyDirectionRecord(added.value, frame, 'Edited plot.', 'Drafted plot.');

    expect(record.selected).toEqual({
      genre: ['Mystery'],
      cast: ['My cat Mochi'],
      mood: ['Funny'],
    });
    expect(record.customSelected).toEqual({ cast: ['My cat Mochi'] });
    expect(record.frame.genre).toEqual([{ value: 'Mystery', rolled: false }]);
    expect(record.frame.setting?.[0].rolled).toBe(true);
    expect(record.frame.format).toBeUndefined();
    expect(record.turningPoint).toBe(frame.turningPoint.label);
    expect(record.plotEn).toBe('Edited plot.');
    expect(record.draftedPlotEn).toBe('Drafted plot.');
  });

  it('leaves out what has nothing to say', () => {
    const [frame] = rollPlotFrames(EMPTY_STORY_DIRECTION, seeded(1));
    const record = storyDirectionRecord(EMPTY_STORY_DIRECTION, frame, 'Plot.', 'Plot.');
    expect(record.selected).toEqual({});
    expect('customSelected' in record).toBe(false);
    expect('draftedPlotEn' in record).toBe(false);
  });
});
