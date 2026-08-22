import { describe, expect, it } from 'vitest';
import { vocabularyItemId, type VocabularyItemId } from '../shared/ids';
import type { RandomSource } from '../shared/random';
import { PALETTE_SIZES, paletteSizeFor, samplePalette } from './suggestion-palette';

function ids(count: number): readonly VocabularyItemId[] {
  return Array.from({ length: count }, (_value, index) => vocabularyItemId(`v${String(index)}`));
}

/** Always picks the first remaining item, so the selection is exactly the head. */
const firstAlways: RandomSource = { nextInt: () => 0 };

/** Always picks the last remaining item, which pulls the tail forward. */
const lastAlways: RandomSource = { nextInt: (exclusiveMax) => exclusiveMax - 1 };

describe('samplePalette', () => {
  it('uses the injected randomness rather than a hidden source', () => {
    expect(samplePalette(ids(5), 3, firstAlways)).toEqual([
      vocabularyItemId('v0'),
      vocabularyItemId('v1'),
      vocabularyItemId('v2'),
    ]);
    expect(samplePalette(ids(5), 3, lastAlways)).toEqual([
      vocabularyItemId('v4'),
      vocabularyItemId('v0'),
      vocabularyItemId('v1'),
    ]);
  });

  it('never repeats an item', () => {
    const sampled = samplePalette(ids(40), 25, {
      nextInt: (exclusiveMax) => (exclusiveMax * 7) % exclusiveMax,
    });

    expect(new Set(sampled).size).toBe(sampled.length);
  });

  it('caps at the snapshot size instead of padding', () => {
    expect(samplePalette(ids(3), 40, firstAlways)).toHaveLength(3);
  });

  it('returns nothing for an empty snapshot or a zero size', () => {
    expect(samplePalette([], 40, firstAlways)).toEqual([]);
    expect(samplePalette(ids(5), 0, firstAlways)).toEqual([]);
  });

  it('leaves the caller list untouched', () => {
    const source = ids(6);
    const copy = [...source];

    samplePalette(source, 4, lastAlways);

    expect(source).toEqual(copy);
  });
});

describe('paletteSizeFor', () => {
  it('uses the specified sizes, capped by the snapshot', () => {
    expect(PALETTE_SIZES).toEqual({ micro: 40, short: 100, medium: 140, long: 180 });
    expect(paletteSizeFor('micro', 1_800)).toBe(40);
    expect(paletteSizeFor('short', 1_800)).toBe(100);
    expect(paletteSizeFor('medium', 1_800)).toBe(140);
    expect(paletteSizeFor('long', 1_800)).toBe(180);
    expect(paletteSizeFor('short', 60)).toBe(60);
  });
});
