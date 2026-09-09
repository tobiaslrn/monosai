import type { PracticeEvidence, PracticeWindowDays } from '../anki/practice-evidence';
import { FSRS_DIFFICULTY_MAXIMUM } from '../anki/scheduling-signals';
import type { PracticeMode } from '../settings/practice-settings';
import type { VocabularyItemId } from '../shared/ids';
import { sampleWithoutReplacement, type RandomSource } from '../shared/random';

/**
 * Which selection rules produced a target list.
 *
 * Recorded with every selection and carried into a story's provenance, so a
 * list chosen months ago can still be explained by the rules that chose it
 * rather than by whatever the rules have since become.
 */
export const PRACTICE_SELECTION_VERSION = '1';

/**
 * Why a word is in the list, in the learner's terms.
 *
 * Each one names an observation rather than a score. `difficult-in-anki` is the
 * only one drawn from a number, and even that is a threshold on evidence Anki
 * itself maintains, not an estimate Monosai invented.
 */
export type PracticeReason =
  | 'recent-practice'
  | 'still-learning'
  | 'answered-again'
  | 'answered-hard'
  | 'difficult-in-anki'
  | 'chosen';

/**
 * The FSRS difficulty at which a word counts as difficult on its own.
 *
 * On Anki's 1-to-10 memory-state scale, so it is the raw value the provider
 * publishes and never a normalized browser-search figure or a displayed
 * percentage. Below this, difficulty needs a real answer behind it.
 */
export const DIFFICULT_FSRS_THRESHOLD = 7;

/** One eligible expression and everything selection is allowed to judge it by. */
export interface PracticeCandidate {
  readonly canonicalExpression: string;
  readonly visibleExpression: string;
  readonly expressionHash: string;
  /**
   * Every vocabulary item that carries this expression.
   *
   * Kept as a list because the matcher recognizes items, and a story written
   * today has to stay explicable after a later sync gives the same word new
   * item ids. Captured with the target rather than looked up again later.
   */
  readonly itemIds: readonly VocabularyItemId[];
  readonly practice?: PracticeEvidence;
  /** Anki's own memory-state difficulty, on the 1-10 scale, where known. */
  readonly fsrsDifficulty?: number;
}

export interface PracticeTarget {
  readonly canonicalExpression: string;
  readonly visibleExpression: string;
  readonly expressionHash: string;
  readonly itemIds: readonly VocabularyItemId[];
  /** Every reason that applies, not only the pool the word was drawn from. */
  readonly reasons: readonly PracticeReason[];
  readonly origin: 'automatic' | 'manual';
}

export interface PracticeSelectionInput {
  readonly mode: PracticeMode;
  readonly windowDays: PracticeWindowDays;
  /** Slots available in total, including the ones manual choices occupy. */
  readonly limit: number;
  readonly candidates: readonly PracticeCandidate[];
  /** Canonical expressions the learner picked, in the order they picked them. */
  readonly pinned?: readonly string[];
  readonly random: RandomSource;
}

export interface PracticeSelection {
  readonly algorithmVersion: string;
  readonly mode: PracticeMode;
  readonly windowDays: PracticeWindowDays;
  readonly limit: number;
  readonly targets: readonly PracticeTarget[];
  /** Unique expressions answered inside the chosen window. */
  readonly recentCandidateCount: number;
  /** Unique expressions with positive difficulty evidence. */
  readonly difficultCandidateCount: number;
  /**
   * Pinned expressions the current vocabulary no longer contains.
   *
   * Reported rather than dropped: a word that vanished because a source was
   * removed is something the learner has to decide about, and silently sending
   * it as a target would ask the model for a word outside the allowlist.
   */
  readonly unavailablePins: readonly string[];
  /**
   * Pinned expressions that did not fit inside the current limit.
   *
   * Shortening a story shrinks the list, and dropping somebody's own choices
   * silently to make room is the one thing a manual pick must never suffer. The
   * conflict is named so the learner can drop a pin or restore the length.
   */
  readonly excessPins: readonly string[];
}

/**
 * How many unique words one story is asked to practise.
 *
 * These are unique targets, not occurrences: a long story should meet the same
 * word in several contexts rather than carry a hundred separate obligations.
 * The steps are product defaults chosen to stay comfortably inside what a model
 * will place naturally, and they are meant to be re-evaluated against real
 * generations rather than treated as measured optima.
 */
export function practiceTargetLimit(sentenceCount: number): number {
  if (!Number.isFinite(sentenceCount)) {
    return 3;
  }
  if (sentenceCount >= 50) {
    return 12;
  }
  if (sentenceCount >= 30) {
    return 8;
  }
  if (sentenceCount >= 15) {
    return 6;
  }
  return 3;
}

/** Whether the expression was answered inside the chosen window. */
export function isRecentCandidate(
  candidate: PracticeCandidate,
  windowDays: PracticeWindowDays,
): boolean {
  const answered = candidate.practice?.answeredWithinDays;
  return answered !== undefined && answered <= windowDays;
}

/** Whether some observation, rather than an absence of one, says this is hard. */
export function isDifficultCandidate(candidate: PracticeCandidate): boolean {
  return difficultyTier(candidate) !== null;
}

/**
 * Every reason that currently applies to a word.
 *
 * Computed from the evidence, not from the pool the word happened to be drawn
 * from, so an expression that is both recent and difficult says so once and
 * still occupies one slot.
 *
 * A learning or short-interval reason can come from a different card than the
 * one that put the expression inside a one-day window, because both were
 * established per card and then merged for the word. Each statement is true of
 * some card the learner has, which is the property that matters; what is never
 * done is asserting them of the same card without having seen that.
 */
export function practiceReasonsFor(
  candidate: PracticeCandidate,
  windowDays: PracticeWindowDays,
  origin: 'automatic' | 'manual',
): readonly PracticeReason[] {
  if (origin === 'manual') {
    return ['chosen'];
  }
  const reasons: PracticeReason[] = [];
  if (isRecentCandidate(candidate, windowDays)) {
    reasons.push('recent-practice');
  }
  if (candidate.practice?.recentlyAnsweredWhileLearning === true) {
    reasons.push('still-learning');
  }
  if (candidate.practice?.answeredAgain === true) {
    reasons.push('answered-again');
  }
  if (candidate.practice?.answeredHard === true) {
    reasons.push('answered-hard');
  }
  if (meetsFsrsDifficulty(candidate.fsrsDifficulty)) {
    reasons.push('difficult-in-anki');
  }
  return reasons;
}

/**
 * Chooses the words one story will practise.
 *
 * Pure, and random only through the injected source, so the same candidates and
 * the same draws give the same list every time. Nothing here reaches for a
 * clock: recency is a membership some source established, never an age this
 * function computes.
 *
 * Sampling is uniform within a tier. A word that ranks below the cut is not
 * ranked at all — there is no hidden score deciding which of two words the
 * learner answered Again yesterday matters more — and Shuffle is what offers a
 * different draw.
 */
export function selectPracticeTargets(input: PracticeSelectionInput): PracticeSelection {
  const byExpression = deduplicate(input.candidates);
  const limit = Math.max(0, Math.trunc(input.limit));
  const candidates = [...byExpression.values()];
  const base = {
    algorithmVersion: PRACTICE_SELECTION_VERSION,
    mode: input.mode,
    windowDays: input.windowDays,
    limit,
    recentCandidateCount: candidates.filter((candidate) =>
      isRecentCandidate(candidate, input.windowDays),
    ).length,
    difficultCandidateCount: candidates.filter(isDifficultCandidate).length,
  };

  if (input.mode === 'free') {
    // Free reading has no targets at all, so a pin cannot be unavailable in it
    // and the learner is not asked about a word this story never promised.
    return { ...base, targets: [], unavailablePins: [], excessPins: [] };
  }

  const pinned = [...new Set(input.pinned ?? [])];
  const unavailablePins = pinned.filter((expression) => !byExpression.has(expression));
  const resolvedPins = pinned.flatMap((expression) => {
    const candidate = byExpression.get(expression);
    return candidate === undefined ? [] : [candidate];
  });
  const excessPins = resolvedPins.slice(limit).map((candidate) => candidate.canonicalExpression);
  const manual = resolvedPins
    .slice(0, limit)
    .map((candidate) => toTarget(candidate, input.windowDays, 'manual'));

  const taken = new Set(manual.map((target) => target.canonicalExpression));
  const available = candidates.filter((candidate) => !taken.has(candidate.canonicalExpression));
  const automatic = selectAutomatically(
    available,
    Math.max(0, limit - manual.length),
    input,
    taken,
  ).map((candidate) => toTarget(candidate, input.windowDays, 'automatic'));

  return { ...base, targets: [...manual, ...automatic], unavailablePins, excessPins };
}

function selectAutomatically(
  available: readonly PracticeCandidate[],
  slots: number,
  input: PracticeSelectionInput,
  taken: Set<string>,
): readonly PracticeCandidate[] {
  if (slots === 0) {
    return [];
  }
  const recent = available.filter((candidate) => isRecentCandidate(candidate, input.windowDays));
  const difficult = available.filter(isDifficultCandidate);

  if (input.mode === 'recent') {
    return drawFromTiers(recent, slots, recentTier, input.random, taken);
  }
  if (input.mode === 'difficult') {
    return drawFromTiers(difficult, slots, difficultyTierIndex, input.random, taken);
  }

  // Daily reserves two thirds for recent practice, and draws the difficult
  // share first so an expression that qualifies for both is spent on the
  // scarcer side rather than eating a recent slot and leaving difficulty empty.
  const recentSlots = Math.ceil((2 * slots) / 3);
  const drawn = [
    ...drawFromTiers(difficult, slots - recentSlots, difficultyTierIndex, input.random, taken),
    ...drawFromTiers(recent, recentSlots, recentTier, input.random, taken),
  ];
  if (drawn.length >= slots) {
    return drawn;
  }

  // One side ran short. The other side's remaining candidates are still real
  // practice evidence, so they fill the gap under their own reasons; nothing
  // outside either pool is ever used to pad a focus list.
  const remainder = [...difficult, ...recent];
  return [
    ...drawn,
    ...drawFromTiers(remainder, slots - drawn.length, recentTier, input.random, taken),
  ];
}

/**
 * Draws uniformly within each tier, best tier first.
 *
 * Candidates are ordered canonically before sampling, so the same set of words
 * yields the same draw no matter which order the sources were read in. Without
 * that, adding a second source could silently change which word a seeded draw
 * picks even though nothing about the evidence changed.
 */
function drawFromTiers(
  candidates: readonly PracticeCandidate[],
  slots: number,
  tierOf: (candidate: PracticeCandidate) => number,
  random: RandomSource,
  taken: Set<string>,
): readonly PracticeCandidate[] {
  const drawn: PracticeCandidate[] = [];
  if (slots <= 0) {
    return drawn;
  }
  const pool = [...candidates]
    .filter((candidate) => !taken.has(candidate.canonicalExpression))
    .sort((left, right) => left.canonicalExpression.localeCompare(right.canonicalExpression, 'ja'));
  const tiers = [...new Set(pool.map(tierOf))].sort((left, right) => left - right);

  for (const tier of tiers) {
    if (drawn.length >= slots) {
      break;
    }
    const inTier = pool.filter(
      (candidate) => tierOf(candidate) === tier && !taken.has(candidate.canonicalExpression),
    );
    for (const candidate of sampleWithoutReplacement(inTier, slots - drawn.length, random)) {
      taken.add(candidate.canonicalExpression);
      drawn.push(candidate);
    }
  }
  return drawn;
}

/**
 * Ranks a recent word by how much it still looks like work in progress.
 *
 * Learning state first, then a short interval, then any other answered word.
 * The correlation behind the first two was established per card during import,
 * so neither tier can be reached by pairing one sibling's answer with another
 * sibling's schedule.
 */
function recentTier(candidate: PracticeCandidate): number {
  if (candidate.practice?.recentlyAnsweredWhileLearning === true) {
    return 0;
  }
  return candidate.practice?.recentlyAnsweredWithShortInterval === true ? 1 : 2;
}

/** Difficulty tiers, or null where nothing positive says the word is hard. */
function difficultyTier(candidate: PracticeCandidate): number | null {
  if (candidate.practice?.answeredAgain === true) {
    return 0;
  }
  if (candidate.practice?.answeredHard === true) {
    return 1;
  }
  return meetsFsrsDifficulty(candidate.fsrsDifficulty) ? 2 : null;
}

function difficultyTierIndex(candidate: PracticeCandidate): number {
  return difficultyTier(candidate) ?? Number.MAX_SAFE_INTEGER;
}

function meetsFsrsDifficulty(difficulty: number | undefined): boolean {
  return (
    difficulty !== undefined &&
    Number.isFinite(difficulty) &&
    difficulty >= DIFFICULT_FSRS_THRESHOLD &&
    difficulty <= FSRS_DIFFICULTY_MAXIMUM
  );
}

function toTarget(
  candidate: PracticeCandidate,
  windowDays: PracticeWindowDays,
  origin: 'automatic' | 'manual',
): PracticeTarget {
  return {
    canonicalExpression: candidate.canonicalExpression,
    visibleExpression: candidate.visibleExpression,
    expressionHash: candidate.expressionHash,
    itemIds: candidate.itemIds,
    reasons: practiceReasonsFor(candidate, windowDays, origin),
    origin,
  };
}

/** One entry per canonical expression; the first contribution wins its labels. */
function deduplicate(
  candidates: readonly PracticeCandidate[],
): ReadonlyMap<string, PracticeCandidate> {
  const byExpression = new Map<string, PracticeCandidate>();
  for (const candidate of candidates) {
    if (candidate.canonicalExpression === '' || byExpression.has(candidate.canonicalExpression)) {
      continue;
    }
    byExpression.set(candidate.canonicalExpression, candidate);
  }
  return byExpression;
}
