import type { StoryForm } from '../reading/reading';
import type { RandomSource } from '../shared/random';
import type { VocabularyItemId } from '../shared/ids';
import type { AnkiSchedulingSignals } from '../anki/scheduling-signals';
import type { AnkiWordPriorityMode } from '../settings/settings';

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

export const PALETTE_BASELINE_WEIGHT = 1_000;

/** One item and the optional Anki scheduling state used to weight it. */
export interface PaletteCandidate extends AnkiSchedulingSignals {
  readonly id: VocabularyItemId;
}

/**
 * Samples a palette with a partial Fisher-Yates shuffle.
 *
 * Only the first `size` positions are resolved, so a 1,800-entry snapshot costs
 * at most 180 swaps rather than 1,800. The input is never mutated, and the randomness
 * comes from an injected source so a test can drive an exact selection.
 */
export function samplePalette(
  itemIdsOrCandidates: readonly VocabularyItemId[] | readonly PaletteCandidate[],
  size: number,
  random: RandomSource,
  mode?: AnkiWordPriorityMode,
): readonly VocabularyItemId[] {
  const items = itemIdsOrCandidates as readonly (VocabularyItemId | PaletteCandidate)[];
  const selectedMode = mode ?? 'uniform';
  if (typeof items[0] !== 'string') {
    return sampleWeightedPalette(items as readonly PaletteCandidate[], size, selectedMode, random);
  }
  const itemIds = items as readonly VocabularyItemId[];
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

/**
 * Computes the integer weight for one palette candidate.
 *
 * The input is already normalized at the persistence/provider boundaries, but
 * this function remains defensive because snapshots from older installs and
 * test doubles can contain absent or invalid optional fields.
 */
export function priorityWeight(
  mode: AnkiWordPriorityMode,
  candidate: AnkiSchedulingSignals,
): number {
  if (mode === 'uniform') {
    return PALETTE_BASELINE_WEIGHT;
  }

  if (mode === 'recent') {
    const reps = candidate.reps;
    return reps !== undefined && Number.isInteger(reps) && reps > 0
      ? PALETTE_BASELINE_WEIGHT + Math.round(3_000 / Math.sqrt(reps))
      : PALETTE_BASELINE_WEIGHT;
  }

  const lapseRatio =
    candidate.lapseRatio !== undefined &&
    Number.isFinite(candidate.lapseRatio) &&
    candidate.lapseRatio >= 0 &&
    candidate.lapseRatio <= 1
      ? candidate.lapseRatio
      : 0;
  const ease = easePenalty(candidate.easeFactor);
  return PALETTE_BASELINE_WEIGHT + Math.round(3_000 * (0.75 * lapseRatio + 0.25 * ease));
}

/** Alias that reads naturally in callers and keeps the formula independently testable. */
export const weightForPriority = priorityWeight;

/** Ease-factor penalty used by Difficult mode. Missing and zero ease are neutral. */
export function easePenalty(factor: number | undefined): number {
  if (factor === undefined || !Number.isFinite(factor) || factor <= 0) {
    return 0;
  }
  return clamp((2_500 - factor) / 1_200, 0, 1);
}

/**
 * Samples weighted candidates without replacement. Uniform mode delegates to
 * the existing partial Fisher–Yates sampler so its established sequence stays
 * byte-for-byte compatible with existing runs and tests.
 */
export function sampleWeightedPalette(
  candidates: readonly PaletteCandidate[],
  size: number,
  mode: AnkiWordPriorityMode,
  random: RandomSource,
): readonly VocabularyItemId[] {
  const uniqueCandidates = deduplicateCandidates(candidates);
  const wanted = Math.max(0, Math.min(Math.trunc(size), uniqueCandidates.length));
  if (wanted === 0) {
    return [];
  }
  if (mode === 'uniform') {
    return samplePalette(
      uniqueCandidates.map((candidate) => candidate.id),
      wanted,
      random,
    );
  }

  const pool = [...uniqueCandidates];
  const sampled: VocabularyItemId[] = [];
  for (let draw = 0; draw < wanted; draw += 1) {
    const weights = pool.map((candidate) => priorityWeight(mode, candidate));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = random.nextInt(total);
    // RandomSource's contract guarantees the range. Clamping here keeps a
    // malformed test double from producing a duplicate or an undefined id.
    ticket = Math.max(0, Math.min(total - 1, Math.trunc(ticket)));
    let cursor = 0;
    let selectedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cursor += weights[index];
      if (ticket < cursor) {
        selectedIndex = index;
        break;
      }
    }
    sampled.push(pool[selectedIndex].id);
    pool.splice(selectedIndex, 1);
  }
  return sampled;
}

/** More explicit name for consumers that want to emphasize no replacement. */
export const sampleWeightedPaletteWithoutReplacement = sampleWeightedPalette;

/** The palette size for a form, capped by what the snapshot actually holds. */
export function paletteSizeFor(form: StoryForm, snapshotSize: number): number {
  return Math.min(PALETTE_SIZES[form], snapshotSize);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deduplicateCandidates(
  candidates: readonly PaletteCandidate[],
): readonly PaletteCandidate[] {
  const seen = new Set<VocabularyItemId>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}
