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
 * returned rather than trusted from the search query alone.
 */
export const cardsInfoSchema = z.array(
  z.object({
    cardId: z.number().int(),
    note: z.number().int(),
    reps: z.number().int().nonnegative(),
    deckName: z.string(),
  }),
);

export const notesInfoSchema = z.array(
  z.object({
    noteId: z.number().int(),
    modelName: z.string(),
    fields: z.record(z.string(), z.object({ value: z.string(), order: z.number().int() })),
  }),
);
