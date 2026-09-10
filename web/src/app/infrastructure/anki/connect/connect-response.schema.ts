import { z } from 'zod';

/**
 * AnkiConnect always answers with this envelope, including for failures: the
 * HTTP status stays 200 and `error` carries the message. Treating a non-null
 * `error` as success is the mistake this schema exists to prevent.
 */
export const connectEnvelopeSchema = z.object({
  result: z.unknown(),
  error: z.string().nullable(),
});

export const versionSchema = z.number().int().positive();

export const permissionSchema = z.object({
  permission: z.enum(['granted', 'denied']),
  requireApiKey: z.boolean().optional(),
  version: z.number().int().optional(),
});

export const nameListSchema = z.array(z.string());

export const cardIdListSchema = z.array(z.number().int());

/**
 * Only the card fields eligibility depends on.
 *
 * `reps` is the review evidence, `note` links the card to its note, and
 * `deckName` lets the deck scope be confirmed against what Anki actually
 * returned rather than trusted from the search query alone. `queue` identifies
 * an explicitly suspended card, which is not vocabulary even if it has reps.
 */
export const cardsInfoSchema = z.array(
  z
    .object({
      cardId: z.number().int(),
      note: z.number().int(),
      reps: z.number().int().nonnegative(),
      queue: z.number().int(),
      /** Scheduling columns are absent from some Anki-compatible bridges. */
      lapses: z.number().int().nonnegative().nullable().optional(),
      factor: z.number().int().nonnegative().nullable().optional(),
      /** Anki's `ivl`: positive days, or negative seconds while a card is learning. */
      interval: z.number().int().nullable().optional(),
      /** Anki's card type code, which says whether the card is being learned. */
      cardType: z.number().int().nullable().optional(),
      /** The desktop add-on's name for the same code; folded into `cardType` below. */
      type: z.number().int().nullable().optional(),
      /** Raw FSRS memory-state difficulty, validated against its scale in the domain. */
      fsrsDifficulty: z.number().nullable().optional(),
      /** Epoch milliseconds of the last answer. The bridge converts from seconds. */
      lastReviewedAt: z.number().int().nullable().optional(),
      deckName: z.string(),
      /**
       * Home deck of a card currently in a filtered deck.
       *
       * A filtered deck moves a card without changing where it belongs, so deck
       * scope has to be checked against this where it exists. Without it, studying
       * from a filtered deck would silently drop a mapping's own cards.
       */
      originalDeckName: z.string().nullable().optional(),
    })
    // AnkiConnect reports the card type as `type` and the first-party bridge as
    // `cardType`. Reading only one would silently drop learning state for the
    // other source, so both arrive at one field and the rest of the adapter
    // never has to know which endpoint answered.
    .transform(({ type, ...card }) => ({ ...card, cardType: card.cardType ?? type })),
);

/**
 * One entry per review, keyed by card id as a string.
 *
 * Only the fields the first-review calculation needs are declared; Zod strips
 * the rest, so a bridge that sends more costs nothing. `ease` is zero for a
 * manual reschedule rather than an answered card, which is what separates a
 * review from the bulk rewrite that enabling FSRS performs.
 */
export const reviewsOfCardsSchema = z.record(
  z.string(),
  z.array(z.object({ id: z.number().int().positive(), ease: z.number().int() })),
);

export const notesInfoSchema = z.array(
  z.object({
    noteId: z.number().int(),
    modelName: z.string(),
    fields: z.record(z.string(), z.object({ value: z.string(), order: z.number().int() })),
  }),
);
