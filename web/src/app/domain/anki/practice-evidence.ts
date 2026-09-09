/**
 * What a source observed about the learner's recent study, as evidence rather
 * than as a score.
 *
 * Anki already answers "which cards did I answer in the last N study days" and
 * "which of those did I answer Again or Hard". Those searches are authoritative
 * about their own windows, including a deck that was reset and started again,
 * which no amount of arithmetic over intervals or repetition counts can
 * reconstruct. This module is the shape that answer travels in.
 *
 * The distinction the whole model turns on is between a question a source
 * answered "no" to and one it could not answer at all. Absence of evidence is
 * never negative evidence: a bridge that cannot run the searches must leave the
 * learner with a stated limitation, not with a vocabulary that looks like it was
 * never studied.
 */

/** The three windows the learner can choose between, in Anki study days. */
export const PRACTICE_WINDOWS = [1, 3, 7] as const;

export type PracticeWindowDays = (typeof PRACTICE_WINDOWS)[number];

/**
 * Whether a source could answer one family of questions during a capture.
 *
 * `unsupported` is a permanent property of the endpoint — an AnkiDroid too old
 * to publish a column, a package without a review log. `unavailable` is this
 * capture failing a question the endpoint normally answers, which is worth
 * retrying and worth saying differently.
 */
export type EvidenceAvailability = 'available' | 'unsupported' | 'unavailable';

/**
 * How a capture's day boundaries were drawn.
 *
 * A live source asks Anki, so its windows are Anki study days with the
 * learner's own rollover. A package cannot be asked, and where its collection
 * metadata does not establish the boundary the window is plain elapsed days
 * from the moment of export. Those are not the same question near midnight, and
 * the difference is recorded rather than smoothed over.
 */
export type PracticeWindowBasis = 'anki-study-days' | 'rolling-days';

/**
 * What one source proved during one capture, recorded once for the capture
 * rather than repeated on every word.
 */
export interface PracticeObservationBasis {
  /** Membership in the answered-within-N-days pools. */
  readonly recentAnswers: EvidenceAvailability;
  /** Membership in the Again and Hard pools of the last seven study days. */
  readonly recentDifficulty: EvidenceAvailability;
  /** Whether a card is currently being learned or relearned. */
  readonly learningState: EvidenceAvailability;
  readonly fsrsDifficulty: EvidenceAvailability;
  readonly windowBasis: PracticeWindowBasis;
  /** When the source was actually read, in epoch milliseconds. */
  readonly observedAt: number;
}

/**
 * One expression's practice evidence under a capture's basis.
 *
 * Every field is meaningful only where the matching basis says `available`;
 * read them through the helpers below, which take the basis and answer
 * `undefined` for a question that was never asked.
 */
export interface PracticeEvidence {
  /**
   * The narrowest answered-within window the expression falls in.
   *
   * Anki's own pools nest — everything answered today was also answered within
   * three days — so one number says which pools contain it and the nesting
   * cannot be violated by construction. Absent means it was not answered inside
   * the widest window, which is a real "no" only when `recentAnswers` is
   * available.
   */
  readonly answeredWithinDays?: PracticeWindowDays;
  /** Answered Again at least once in the difficulty window. */
  readonly answeredAgain?: true;
  /** Answered Hard at least once in the difficulty window. */
  readonly answeredHard?: true;
  /**
   * One and the same card was answered recently and is still being learned.
   *
   * Correlated per card on purpose. Combining one sibling's recent answer with
   * another sibling's learning state would claim something about a card that is
   * not true of any card the learner has.
   */
  readonly recentlyAnsweredWhileLearning?: true;
  /** One and the same card was answered recently and is due again within a week. */
  readonly recentlyAnsweredWithShortInterval?: true;
}

/**
 * Evidence as it arrives, before normalization.
 *
 * Wider than the stored shape on purpose: a provider reply, a persisted row and
 * a merge all produce ordinary numbers and booleans, and narrowing them to the
 * positive-only form is exactly what `normalizePracticeEvidence` is for.
 */
export interface PracticeEvidenceInput {
  readonly answeredWithinDays?: number;
  readonly answeredAgain?: boolean;
  readonly answeredHard?: boolean;
  readonly recentlyAnsweredWhileLearning?: boolean;
  readonly recentlyAnsweredWithShortInterval?: boolean;
}

/** Anki's card type codes. Only the two that mean "being learned" are named. */
export const CARD_TYPE_LEARNING = 1;
export const CARD_TYPE_RELEARNING = 3;

/** The interval below which a recently answered card still counts as in progress. */
export const SHORT_INTERVAL_DAYS = 7;

/** Whether Anki's card type says this card is being learned or relearned. */
export function isLearningCardType(cardType: number | undefined): boolean {
  return cardType === CARD_TYPE_LEARNING || cardType === CARD_TYPE_RELEARNING;
}

/**
 * A basis for a source that answered nothing, used before a first capture and
 * for a source read before practice evidence existed.
 */
export function unmeasuredBasis(observedAt: number): PracticeObservationBasis {
  return {
    recentAnswers: 'unsupported',
    recentDifficulty: 'unsupported',
    learningState: 'unsupported',
    fsrsDifficulty: 'unsupported',
    windowBasis: 'anki-study-days',
    observedAt,
  };
}

/** Keeps provider output in the normalized shape persisted by the app. */
export function normalizePracticeEvidence(
  evidence: PracticeEvidenceInput | null | undefined,
): PracticeEvidence {
  const answeredWithinDays = PRACTICE_WINDOWS.find(
    (window) => window === evidence?.answeredWithinDays,
  );
  // Only a positive flag is stored, so "not observed" and "observed false" have
  // one shape and no caller can read the difference where there is none.
  return {
    ...(answeredWithinDays === undefined ? {} : { answeredWithinDays }),
    ...(evidence?.answeredAgain === true ? { answeredAgain: true } : {}),
    ...(evidence?.answeredHard === true ? { answeredHard: true } : {}),
    ...(evidence?.recentlyAnsweredWhileLearning === true
      ? { recentlyAnsweredWhileLearning: true }
      : {}),
    ...(evidence?.recentlyAnsweredWithShortInterval === true
      ? { recentlyAnsweredWithShortInterval: true }
      : {}),
  };
}

/**
 * Merges evidence for the same expression from several cards, notes or sources.
 *
 * Positive evidence from any contribution wins, and the narrowest window wins,
 * because each contribution is a real observation of a real card. Nothing here
 * can invent a membership: an expression only enters a pool because some card
 * that carries it was in that pool.
 */
export function mergePracticeEvidence(
  left: PracticeEvidence | undefined,
  right: PracticeEvidence | undefined,
): PracticeEvidence {
  const a = normalizePracticeEvidence(left);
  const b = normalizePracticeEvidence(right);
  const answeredWithinDays = narrowest(a.answeredWithinDays, b.answeredWithinDays);
  return normalizePracticeEvidence({
    ...(answeredWithinDays === undefined ? {} : { answeredWithinDays }),
    answeredAgain: a.answeredAgain === true || b.answeredAgain === true,
    answeredHard: a.answeredHard === true || b.answeredHard === true,
    recentlyAnsweredWhileLearning:
      a.recentlyAnsweredWhileLearning === true || b.recentlyAnsweredWhileLearning === true,
    recentlyAnsweredWithShortInterval:
      a.recentlyAnsweredWithShortInterval === true || b.recentlyAnsweredWithShortInterval === true,
  });
}

function narrowest(
  left: PracticeWindowDays | undefined,
  right: PracticeWindowDays | undefined,
): PracticeWindowDays | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return left <= right ? left : right;
}
