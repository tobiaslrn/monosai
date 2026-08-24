import { z } from 'zod';
import {
  nonEmptyString,
  readingIdSchema,
  rowVersionSchema,
  sentenceIdSchema,
  snapshotIdSchema,
  timestampSchema,
  vocabularyItemIdSchema,
} from './common.schema';

const tokenValidationSchema = z.discriminatedUnion('category', [
  z.object({ category: z.literal('punctuation') }),
  z.object({
    category: z.literal('anki-exact'),
    vocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
  }),
  z.object({
    category: z.literal('anki-normalized'),
    vocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
    basis: nonEmptyString,
  }),
  z.object({
    category: z.literal('anki-phrase'),
    vocabularyItemId: vocabularyItemIdSchema,
    tokenSpan: z.object({
      startTokenIndex: z.number().int().nonnegative(),
      endTokenIndex: z.number().int().nonnegative(),
    }),
  }),
  z.object({ category: z.literal('structural-baseline'), ruleId: nonEmptyString }),
  z.object({
    category: z.literal('entity'),
    entityKind: z.enum(['name', 'number', 'date', 'time', 'symbol']),
  }),
  z.object({
    category: z.literal('policy-exception'),
    exceptionId: nonEmptyString,
    explanationEn: z.string(),
  }),
  z.object({ category: z.literal('not-in-snapshot') }),
  z.object({
    category: z.literal('unknown'),
    reason: z.enum(['not-in-vocabulary', 'rejected-by-policy', 'unresolved-after-repair']),
  }),
]);

export const frozenValidationRowSchema = z.object({
  v: rowVersionSchema,
  sentenceId: sentenceIdSchema,
  readingId: readingIdSchema,
  snapshotId: snapshotIdSchema,
  validatorVersion: nonEmptyString,
  tokenStatuses: z
    .array(z.object({ tokenId: nonEmptyString, validation: tokenValidationSchema }))
    .readonly(),
});

export const generationProvenanceRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  readingId: readingIdSchema,
  snapshotId: snapshotIdSchema,
  grammarProfileSnapshotId: nonEmptyString,
  // Empty when the learner had configured no exception policy: an absent policy
  // is a real state, and rejecting it here would make it unrepresentable.
  exceptionPolicyHash: z.string(),
  modelId: nonEmptyString,
  promptVersions: z.record(z.string(), nonEmptyString),
  repairAttempts: z.number().int().min(0).max(2),
  suggestedVocabularyItemIds: z.array(vocabularyItemIdSchema).readonly(),
  ankiWordPriorityMode: z.enum(['uniform', 'recent', 'difficult']).default('uniform'),
  createdAt: timestampSchema,
});

export type FrozenValidationRow = z.infer<typeof frozenValidationRowSchema>;
export type GenerationProvenanceRow = z.infer<typeof generationProvenanceRowSchema>;
