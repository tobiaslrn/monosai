import { z } from 'zod';
import {
  grammarRuleIdSchema,
  nonEmptyString,
  rowVersionSchema,
  timestampSchema,
} from './common.schema';

export const grammarSelectionRowSchema = z.object({
  v: rowVersionSchema,
  ruleId: grammarRuleIdSchema,
  selectedAt: timestampSchema,
});

export const customGrammarRuleRowSchema = z.object({
  v: rowVersionSchema,
  id: grammarRuleIdSchema,
  name: nonEmptyString,
  description: nonEmptyString,
  exampleJa: z.string().optional(),
  enabled: z.boolean(),
  position: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const capturedRuleSchema = z.object({
  ruleId: grammarRuleIdSchema,
  label: nonEmptyString,
  description: z.string(),
  exampleJa: z.string().optional(),
});

export const grammarProfileSnapshotRowSchema = z.object({
  v: rowVersionSchema,
  id: nonEmptyString,
  profileHash: nonEmptyString,
  capturedAt: timestampSchema,
  selectedCatalogRules: z.array(capturedRuleSchema).readonly(),
  enabledCustomRules: z.array(capturedRuleSchema).readonly(),
  structuralBaselineVersion: nonEmptyString,
});

export type GrammarSelectionRow = z.infer<typeof grammarSelectionRowSchema>;
export type CustomGrammarRuleRow = z.infer<typeof customGrammarRuleRowSchema>;
export type GrammarProfileSnapshotRow = z.infer<typeof grammarProfileSnapshotRowSchema>;
