import { z } from 'zod';
import { PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../domain/reading/token';
import { JLPT_LEVELS_EASIEST_FIRST } from '../../domain/grammar/rules';
import {
  GRAMMAR_PRESET_IDS_EASIEST_FIRST,
  MAXIMUM_GUIDANCE_LENGTH,
} from '../../domain/grammar/presets';

const partOfSpeechValues = Object.keys(PART_OF_SPEECH_LABELS) as [PartOfSpeech, ...PartOfSpeech[]];
export const partOfSpeechSchema = z.enum(partOfSpeechValues);

const nonEmpty = z.string().min(1);

const licenceSchema = z.object({
  component: nonEmpty,
  spdx: nonEmpty,
  holder: nonEmpty,
  url: nonEmpty,
});

const attributionSchema = z.object({
  name: nonEmpty,
  role: nonEmpty,
  licences: z.array(licenceSchema).min(1),
  noticeEn: nonEmpty,
  redistribution: nonEmpty,
});

const fileSchema = z.object({
  path: nonEmpty,
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const componentSchema = z.object({
  version: nonEmpty,
  files: z.array(fileSchema).min(1),
  attribution: attributionSchema,
});

const levelCountsSchema = z.object(
  Object.fromEntries(
    JLPT_LEVELS_EASIEST_FIRST.map((level) => [level, z.number().int().nonnegative()]),
  ) as Record<(typeof JLPT_LEVELS_EASIEST_FIRST)[number], z.ZodNumber>,
);

export const languageAssetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  bundleVersion: nonEmpty,
  components: z.object({
    tokenizer: componentSchema.extend({ engine: nonEmpty }),
    dictionary: componentSchema.extend({ entryCount: z.number().int().positive() }),
    grammarCatalog: componentSchema.extend({
      ruleCount: z.number().int().positive(),
      countsByLevel: levelCountsSchema,
      presetCount: z.number().int().positive(),
    }),
    structuralBaseline: componentSchema.extend({ entryCount: z.number().int().positive() }),
  }),
});

export const grammarCatalogAssetSchema = z.object({
  schemaVersion: z.literal(1),
  version: nonEmpty,
  sourceId: nonEmpty,
  ruleCount: z.number().int().positive(),
  countsByLevel: levelCountsSchema,
  presets: z
    .array(
      z.object({
        id: z.enum(GRAMMAR_PRESET_IDS_EASIEST_FIRST),
        order: z.number().int().nonnegative(),
        nameEn: nonEmpty,
        captionEn: nonEmpty,
        descriptionEn: nonEmpty,
        exampleJa: nonEmpty,
        exampleEn: nonEmpty,
        promptGuidance: nonEmpty.max(MAXIMUM_GUIDANCE_LENGTH),
      }),
    )
    .length(GRAMMAR_PRESET_IDS_EASIEST_FIRST.length),
  registerGuidance: z.object({
    spoken: nonEmpty,
    written: nonEmpty,
    either: z.literal(''),
  }),
  rules: z
    .array(
      z.object({
        id: nonEmpty,
        level: z.enum(JLPT_LEVELS_EASIEST_FIRST),
        pattern: nonEmpty,
        nameEn: nonEmpty,
        descriptionEn: nonEmpty,
        formation: nonEmpty.optional(),
        exampleJa: nonEmpty.optional(),
        exampleEn: nonEmpty.optional(),
        searchAliases: z.array(nonEmpty).optional(),
      }),
    )
    .min(1),
});

export const structuralBaselineAssetSchema = z.object({
  schemaVersion: z.literal(1),
  version: nonEmpty,
  entryCount: z.number().int().positive(),
  countsByCategory: z.record(z.string(), z.number().int().nonnegative()),
  overlappingForms: z.array(
    z.object({
      form: nonEmpty,
      partOfSpeech: partOfSpeechSchema,
      resolvesTo: nonEmpty,
      alsoDeclaredBy: z.array(nonEmpty),
    }),
  ),
  entries: z
    .array(
      z.object({
        id: nonEmpty,
        category: z.enum([
          'particle',
          'copula',
          'auxiliary',
          'inflection',
          'conjunction',
          'formal-noun',
          'affix',
          'counter',
          'punctuation',
        ]),
        forms: z.array(nonEmpty).min(1),
        readings: z.array(nonEmpty).optional(),
        partsOfSpeech: z.array(partOfSpeechSchema).min(1),
        nameEn: nonEmpty,
        descriptionEn: nonEmpty,
        exampleJa: nonEmpty.optional(),
      }),
    )
    .min(1),
});

/**
 * Header of the compact dictionary artifact.
 *
 * The entry array is validated separately by `validateDictionaryEntries`: a
 * per-entry schema parse over more than twenty thousand records costs far more
 * than a direct structural check, and the check below is exhaustive over every
 * field the runtime reads.
 */
export const dictionaryAssetHeaderSchema = z.object({
  schemaVersion: z.literal(1),
  version: nonEmpty,
  source: z.object({
    name: nonEmpty,
    revision: nonEmpty,
    releasedOn: nonEmpty,
    release: nonEmpty,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  limits: z.object({
    writtenForms: z.number().int().positive(),
    readings: z.number().int().positive(),
    senses: z.number().int().positive(),
    glosses: z.number().int().positive(),
    glossLength: z.number().int().positive(),
  }),
  entryCount: z.number().int().positive(),
});

export interface RawDictionarySense {
  readonly p: readonly PartOfSpeech[];
  readonly g: readonly string[];
}

export interface RawDictionaryEntry {
  readonly i: string;
  readonly w: readonly string[];
  readonly k: readonly string[];
  readonly s: readonly RawDictionarySense[];
}

const PART_OF_SPEECH_SET = new Set<string>(Object.keys(PART_OF_SPEECH_LABELS));

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

/**
 * Structural validation of the dictionary entry array. Returns the index of the
 * first invalid entry, or `null` when every entry is well formed.
 */
export function findInvalidDictionaryEntry(entries: unknown): number | null {
  if (!Array.isArray(entries)) {
    return 0;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const entry: unknown = entries[index];
    if (typeof entry !== 'object' || entry === null) {
      return index;
    }
    const candidate = entry as Partial<Record<'i' | 'w' | 'k' | 's', unknown>>;
    if (typeof candidate.i !== 'string' || candidate.i.length === 0) {
      return index;
    }
    if (!isStringArray(candidate.w) || !isStringArray(candidate.k) || candidate.k.length === 0) {
      return index;
    }
    if (!Array.isArray(candidate.s) || candidate.s.length === 0) {
      return index;
    }
    for (const sense of candidate.s) {
      if (typeof sense !== 'object' || sense === null) {
        return index;
      }
      const senseCandidate = sense as Partial<Record<'p' | 'g', unknown>>;
      if (!Array.isArray(senseCandidate.p) || !isStringArray(senseCandidate.g)) {
        return index;
      }
      if (
        senseCandidate.g.length === 0 ||
        !senseCandidate.p.every((part) => typeof part === 'string' && PART_OF_SPEECH_SET.has(part))
      ) {
        return index;
      }
    }
  }
  return null;
}
