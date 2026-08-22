import type { StoryForm } from '../reading/reading';
import type { RandomSource } from '../shared/random';
import type { VocabularyItemId } from '../shared/ids';

/**
 * How many reviewed items are sampled as inspiration for one story.
 *
 * The palette exists so two stories generated from the same snapshot and the
 * same premise do not converge on the same handful of words. It is never a
 * target list: the complete snapshot remains the allowlist and the local
 * validation authority, and nothing sampled here is shown to the learner.
 */
export const PALETTE_SIZES: Readonly<Record<StoryForm, number>> = {
  micro: 40,
  short: 100,
  medium: 140,
  long: 180,
};

/**
 * Samples a palette with a partial Fisher-Yates shuffle.
 *
 * Only the first `size` positions are resolved, so a 1,800-entry snapshot costs
 * at most 180 swaps rather than 1,800. The input is never mutated, and the randomness
 * comes from an injected source so a test can drive an exact selection.
 */
export function samplePalette(
  itemIds: readonly VocabularyItemId[],
  size: number,
  random: RandomSource,
): readonly VocabularyItemId[] {
  const wanted = Math.max(0, Math.min(Math.trunc(size), itemIds.length));
  if (wanted === 0) {
    return [];
  }

  const pool = [...itemIds];
  for (let index = 0; index < wanted; index += 1) {
    const pick = index + random.nextInt(pool.length - index);
    const swapped = pool[pick];
    pool[pick] = pool[index];
    pool[index] = swapped;
  }
  return pool.slice(0, wanted);
}

/** The palette size for a form, capped by what the snapshot actually holds. */
export function paletteSizeFor(form: StoryForm, snapshotSize: number): number {
  return Math.min(PALETTE_SIZES[form], snapshotSize);
}
