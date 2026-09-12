import { z } from 'zod';

const nonEmpty = z.string().min(1);

const speechEncodeErrorSchema = z.object({
  domain: z.literal('speech-encoder'),
  code: z.enum([
    'unsupported',
    'encode-failed',
    'invalid-input',
    'worker-unavailable',
    'cancelled',
    'unknown',
  ]),
  message: z.string(),
  cause: z.string().optional(),
});

export const speechEncoderRequestMessageSchema = z.object({
  version: z.number().int().positive(),
  requestId: nonEmpty,
  request: z.discriminatedUnion('operation', [
    z.object({
      operation: z.literal('encode'),
      payload: z.object({
        samples: z.instanceof(ArrayBuffer),
        sampleRate: z.number().int().positive(),
        channels: z.number().int().positive(),
      }),
    }),
    z.object({
      operation: z.literal('cancel'),
      payload: z.object({ requestId: nonEmpty }),
    }),
  ]),
});

export const speechEncoderResponseEnvelopeSchema = z.union([
  z.object({
    version: z.number().int().positive(),
    requestId: nonEmpty,
    ok: z.literal(true),
    result: z.object({
      operation: z.literal('encode'),
      value: z.object({ bytes: z.instanceof(ArrayBuffer) }),
    }),
  }),
  z.object({
    version: z.number().int().positive(),
    requestId: nonEmpty,
    ok: z.literal(false),
    error: speechEncodeErrorSchema,
  }),
]);
