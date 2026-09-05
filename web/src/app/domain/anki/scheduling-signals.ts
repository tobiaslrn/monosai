/**
 * The small part of Anki scheduling state that can influence a suggestion
 * palette.  These values are deliberately optional: older package exports and
 * limited Anki bridges can prove review evidence without carrying every
 * scheduling column.
 */
export interface AnkiSchedulingSignals {
  /** Minimum positive `reps` observed for the note's eligible cards. */
  readonly reps?: number;
  /** Maximum `lapses / reps` ratio observed for the note's eligible cards. */
  readonly lapseRatio?: number;
  /** Minimum non-zero ease factor observed for the note's eligible cards. */
  readonly easeFactor?: number;
}

/** Keeps provider output finite and in the normalized shape persisted by the app. */
export function normalizeSchedulingSignals(
  signals: Partial<AnkiSchedulingSignals> | null | undefined,
): AnkiSchedulingSignals {
  const reps = positiveInteger(signals?.reps);
  const lapseRatio = unitInterval(signals?.lapseRatio);
  const easeFactor = positiveFinite(signals?.easeFactor);
  return {
    ...(reps === undefined ? {} : { reps }),
    ...(lapseRatio === undefined ? {} : { lapseRatio }),
    ...(easeFactor === undefined ? {} : { easeFactor }),
  };
}

/** Merges duplicate notes/items using the priority rule for each signal. */
export function mergeSchedulingSignals(
  left: AnkiSchedulingSignals | null | undefined,
  right: AnkiSchedulingSignals | null | undefined,
): AnkiSchedulingSignals {
  const a = normalizeSchedulingSignals(left);
  const b = normalizeSchedulingSignals(right);
  const reps = minimumDefined(a.reps, b.reps);
  const lapseRatio = maximumDefined(a.lapseRatio, b.lapseRatio);
  const easeFactor = minimumDefined(a.easeFactor, b.easeFactor);
  return {
    ...(reps === undefined ? {} : { reps }),
    ...(lapseRatio === undefined ? {} : { lapseRatio }),
    ...(easeFactor === undefined ? {} : { easeFactor }),
  };
}

/** Turns one eligible card's optional columns into normalized note signals. */
export function schedulingSignalsFromCard(
  reps: number,
  lapses?: number,
  factor?: number,
): AnkiSchedulingSignals {
  return normalizeSchedulingSignals({
    reps,
    lapseRatio:
      Number.isFinite(lapses) && (lapses ?? 0) >= 0 && reps > 0 ? (lapses ?? 0) / reps : undefined,
    easeFactor: factor,
  });
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function positiveFinite(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value : undefined;
}

function unitInterval(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) >= 0 && (value ?? 0) <= 1 ? value : undefined;
}

function minimumDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.min(left, right);
}

function maximumDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.max(left, right);
}
