import { z } from 'zod';

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

const ankiErrorSchema = z.object({
  domain: z.literal('anki'),
  code: nonEmpty,
  message: z.string(),
  cause: z.string().optional(),
});

/**
 * Runtime shape of a worker response as seen by the client. Only the envelope is
 * validated: the result payload was produced by code in this repository against
 * the same protocol version, while the envelope is what routing and error
 * handling depend on.
 */
export const packageResponseEnvelopeSchema = z.object({
  protocolVersion: z.number().int(),
  requestId: nonEmpty,
  outcome: z.union([
    z.object({ ok: z.literal(true), result: z.object({ operation: nonEmpty }).loose() }),
    z.object({ ok: z.literal(false), error: ankiErrorSchema }),
  ]),
});
