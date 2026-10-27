import * as z from 'zod';
import type { VocabularyItemId } from '../../domain/shared/ids';

const nonEmpty = z.string().min(1);

/**
 * Runtime shape of one token's validation, shared by the worker protocol and the
 * stored frozen validation.
 *
 * The item id rule is the caller's: the worker protocol accepts any non-empty
 * id, as its requests do, while a stored row insists on the UUID every
 * persisted item carries.
 */
export function tokenValidationSchema(vocabularyItemIdSchema: z.ZodType<VocabularyItemId, string>) {
  return z.discriminatedUnion('category', [
    z.object({ category: z.literal('punctuation') }),
    z.object({
      category: z.literal('anki-exact'),
      vocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
    }),
    z.object({
      category: z.literal('anki-normalized'),
      vocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
      basis: nonEmpty,
    }),
    z.object({
      category: z.literal('anki-phrase'),
      vocabularyItemId: vocabularyItemIdSchema,
      tokenSpan: z.object({
        startTokenIndex: z.number().int().nonnegative(),
        endTokenIndex: z.number().int().nonnegative(),
      }),
    }),
    z.object({ category: z.literal('structural-baseline'), ruleId: nonEmpty }),
    z.object({
      category: z.literal('entity'),
      entityKind: z.enum(['name', 'number', 'date', 'time', 'symbol']),
    }),
    z.object({
      category: z.literal('policy-exception'),
      exceptionId: nonEmpty,
      explanationEn: z.string(),
    }),
    z.object({ category: z.literal('not-in-snapshot') }),
    z.object({
      category: z.literal('unknown'),
      reason: z.enum(['not-in-vocabulary', 'rejected-by-policy', 'unresolved-after-repair']),
    }),
  ]);
}
