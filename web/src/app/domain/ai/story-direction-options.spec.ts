import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_OPTION_LENGTH,
  ROLLED_STORY_AXES,
  STORY_AXES,
  STORY_AXIS_LABELS,
  STORY_AXIS_LIMITS,
  STORY_DIRECTION_OPTIONS,
  TURNING_POINTS,
} from './story-direction-options';

/**
 * The option lists are content, so these are the review rules written down:
 * what a learner can pick has to be tellable with everyday words.
 */
describe('story direction options', () => {
  const everyLabel = [
    ...STORY_AXES.flatMap((axis) => STORY_DIRECTION_OPTIONS[axis]),
    ...TURNING_POINTS.map((turn) => turn.label),
  ];

  it('offers the reviewed number of options per axis', () => {
    expect(STORY_AXES.map((axis) => STORY_DIRECTION_OPTIONS[axis].length)).toEqual([
      24, 20, 30, 20, 8, 10, 20,
    ]);
  });

  it('names every axis in sentence case', () => {
    expect(STORY_AXES.map((axis) => STORY_AXIS_LABELS[axis])).toEqual([
      'Genre',
      'Mood',
      'Setting',
      'Cast',
      'Format',
      'Ending',
      'Time',
    ]);
  });

  it('lists each option once per axis, in sentence case, and short enough for a chip', () => {
    for (const axis of STORY_AXES) {
      const options = STORY_DIRECTION_OPTIONS[axis];
      expect(new Set(options.map((option) => option.toLowerCase())).size).toBe(options.length);
    }
    for (const label of everyLabel) {
      expect(label.length).toBeLessThanOrEqual(MAX_CUSTOM_OPTION_LENGTH);
      expect(label[0]).toBe(label[0].toUpperCase());
      // No all-caps labels anywhere in the application.
      expect(label).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });

  it('leaves out every frame a beginner vocabulary cannot tell', () => {
    const banned =
      /sci-?fi|science fiction|time travel|superhero|fantasy|heist|survival|ghost|horror|robot|fable|news report|cliffhanger/i;
    for (const label of everyLabel) {
      expect(label).not.toMatch(banned);
    }
    for (const turn of TURNING_POINTS) {
      expect(turn.meaning).not.toMatch(banned);
    }
  });

  it('has at least three distinct turning points, each with a meaning', () => {
    expect(new Set(TURNING_POINTS.map((turn) => turn.label)).size).toBe(TURNING_POINTS.length);
    expect(TURNING_POINTS.length).toBeGreaterThanOrEqual(3);
    for (const turn of TURNING_POINTS) {
      expect(turn.meaning.trim()).not.toBe('');
    }
  });

  it('allows two genres and one of everything else', () => {
    expect(STORY_AXES.map((axis) => STORY_AXIS_LIMITS[axis])).toEqual([2, 1, 1, 1, 1, 1, 1]);
  });

  it('rolls only the axes that decide what a story is about', () => {
    expect(ROLLED_STORY_AXES).toEqual(['genre', 'mood', 'setting', 'cast']);
  });
});
