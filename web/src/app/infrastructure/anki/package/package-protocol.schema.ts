import * as z from 'zod';
import { ALL_ANKI_ERROR_CODES } from '../../../domain/anki/anki-error';
import type { PackageOperation, ResultFor } from './package-protocol';

const nonEmpty = z.string().min(1);

/**
 * Matches an `ArrayBuffer` by shape rather than by identity.
 *
 * `instanceof` compares against one realm's constructor, and the buffer arrives
 * from another: transferred into the worker in production, and from the Node
 * realm into jsdom under test. The brand check is what every realm agrees on.
 */
const arrayBufferSchema = z.custom<ArrayBuffer>(
  (value) => Object.prototype.toString.call(value) === '[object ArrayBuffer]',
  { message: 'Expected an ArrayBuffer' },
);

const requestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('open'),
    payload: z.object({ archive: arrayBufferSchema, wasmUrl: nonEmpty }),
  }),
  z.object({ operation: z.literal('discover'), payload: z.object({}) }),
  z.object({
    operation: z.literal('extract'),
    payload: z.object({
      deckName: nonEmpty,
      deckScope: z.enum(['deck-only', 'deck-and-subdecks']),
      noteTypeName: nonEmpty,
      expressionFieldName: nonEmpty,
      meaningFieldName: nonEmpty.optional(),
    }),
  }),
  z.object({ operation: z.literal('close'), payload: z.object({}) }),
  z.object({
    operation: z.literal('cancel'),
    payload: z.object({ targetRequestId: nonEmpty }),
  }),
]);

/**
 * Runtime shape of an incoming worker request.
 *
 * The protocol version is a plain number rather than a literal so a mismatched
 * client produces a `protocol-version-mismatch` response instead of an
 * unhelpful schema error.
 */
export const packageRequestMessageSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  request: requestSchema,
});

export const ankiErrorSchema = z.object({
  domain: z.literal('anki'),
  code: z.enum(ALL_ANKI_ERROR_CODES),
  message: z.string(),
  cause: z.string().optional(),
});

/**
 * Runtime shape of a worker response as seen by the client.
 *
 * The envelope is what routing depends on, so it is checked first and alone:
 * once the request id is known, a malformed result or error can settle that
 * request with `malformed-response` instead of leaving it pending forever.
 */
export const packageResponseEnvelopeSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  outcome: z.union([
    z.object({
      ok: z.literal(true),
      result: z.object({ operation: nonEmpty, value: z.unknown() }),
    }),
    z.object({ ok: z.literal(false), error: z.unknown() }),
  ]),
});

const count = z.number().int().nonnegative();

/**
 * The result value each operation answers with, checked once the operation has
 * been matched against the pending request.
 *
 * Scheduling numbers are only required to be finite here: the provider
 * normalizes their ranges itself, as it does for every other source. `cancel`
 * has no entry because the client never waits on one.
 */
export const packageResultValueSchemas: {
  readonly [TOperation in Exclude<PackageOperation, 'cancel'>]: z.ZodType<ResultFor<TOperation>>;
} = {
  open: z.object({
    memberName: nonEmpty,
    compression: z.enum(['zstd', 'none']),
    packageVersion: z.number().int().nullable(),
    schemaVersion: z.number().int(),
    layout: z.enum(['normalized', 'legacy-json']),
    deckCount: count,
    noteTypeCount: count,
    hasAnyReviewEvidence: z.boolean(),
    mediaEntryCount: count,
  }),
  discover: z.object({
    decks: z.array(z.object({ name: nonEmpty, hasChildren: z.boolean() })),
    noteTypes: z.array(z.object({ name: nonEmpty, fieldNames: z.array(z.string()) })),
  }),
  extract: z.object({
    examined: count,
    fields: z.array(
      z.object({
        sourceNoteId: nonEmpty,
        rawFieldValue: z.string().optional(),
        rawMeaning: z.string().optional(),
        reps: z.number().optional(),
        lapseRatio: z.number().optional(),
        easeFactor: z.number().optional(),
        firstReviewedAt: z.number().optional(),
        intervalDays: z.number().optional(),
        fsrsDifficulty: z.number().optional(),
      }),
    ),
  }),
  close: z.object({ closed: z.boolean() }),
};
