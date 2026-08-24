import type { ImportedReading, GeneratedStory } from '../app/domain/reading/reading';
import type { GenerationProvenance } from '../app/domain/ai/generation-provenance';
import type {
  GeneratedStoryDraft,
  ImportedReadingDraft,
} from '../app/domain/reading/reading-repository';
import type { FrozenSentenceValidation, TokenValidation } from '../app/domain/reading/validation';
import type { Paragraph, Sentence } from '../app/domain/reading/text-hierarchy';
import type { TokenAnalysis } from '../app/domain/reading/token';
import type { GrammarAnalysisRecord, TranslationRecord } from '../app/domain/enrichment/records';
import type {
  VocabularyItem,
  VocabularyProvenance,
  VocabularySnapshot,
} from '../app/domain/vocabulary/snapshot';
import type { SnapshotCommit } from '../app/domain/vocabulary/vocabulary-repository';
import {
  paragraphId,
  readingId,
  sentenceId,
  snapshotId,
  vocabularyItemId,
  vocabularySourceId,
  type ReadingId,
  type SnapshotId,
} from '../app/domain/shared/ids';
import { sha256Hex } from '../app/infrastructure/hashing/sha256';

/**
 * Production-shaped fixtures.
 *
 * Identifiers are deterministic UUIDs so tests can assert exact identity and
 * migration fixtures stay reproducible.
 */
export function uuid(seed: number): string {
  const hex = sha256Hex(`monosai-fixture-${seed}`);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export interface ImportedFixtureOptions {
  readonly seed?: number;
  readonly title?: string;
  readonly paragraphTexts?: readonly (readonly string[])[];
  readonly createdAt?: number;
}

/**
 * Builds an imported reading with paragraphs, sentences, and token analyses.
 * `paragraphTexts` is a list of paragraphs, each a list of sentences.
 */
export function importedReadingFixture(options: ImportedFixtureOptions = {}): ImportedReadingDraft {
  const seed = options.seed ?? 1;
  const createdAt = options.createdAt ?? 1_700_000_000_000;
  const paragraphTexts = options.paragraphTexts ?? [
    ['ねこがすきです。', '毎日ねこを見ます。'],
    ['犬もかわいいです。'],
  ];

  const id = readingId(uuid(seed * 1000));
  const paragraphs: Paragraph[] = [];
  const sentences: Sentence[] = [];
  const tokenAnalyses: TokenAnalysis[] = [];

  let sentenceIndex = 0;
  paragraphTexts.forEach((paragraphSentences, paragraphIndex) => {
    const currentParagraphId = paragraphId(uuid(seed * 1000 + 100 + paragraphIndex));
    paragraphs.push({
      id: currentParagraphId,
      readingId: id,
      position: paragraphIndex,
      sourceText: paragraphSentences.join(''),
    });

    paragraphSentences.forEach((text, positionInParagraph) => {
      const currentSentenceId = sentenceId(uuid(seed * 1000 + 200 + sentenceIndex));
      sentences.push({
        id: currentSentenceId,
        readingId: id,
        paragraphId: currentParagraphId,
        positionInReading: sentenceIndex,
        positionInParagraph,
        japaneseText: text,
        contentHash: sha256Hex(text),
      });
      tokenAnalyses.push({
        sentenceId: currentSentenceId,
        analyzerVersion: 'test-analyzer-1',
        tokens: [
          {
            id: `${currentSentenceId}-0`,
            startUtf16: 0,
            endUtf16: text.length,
            surface: text,
            dictionaryKeys: [],
            isPunctuation: false,
          },
        ],
      });
      sentenceIndex += 1;
    });
  });

  const characterCount = paragraphs.reduce(
    (total, paragraph) => total + paragraph.sourceText.length,
    0,
  );

  const reading: ImportedReading = {
    id,
    kind: 'imported',
    title: options.title ?? 'ねこの一日',
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: null,
    sentenceCount: sentences.length,
    characterCount,
    excerpt: paragraphs[0]?.sourceText ?? '',
    translationSummary: { total: sentences.length, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: sentences.length, completed: 0, failed: 0 },
    analyzerVersion: 'test-analyzer-1',
    importSource: 'paste',
    sourceTextHash: sha256Hex(paragraphs.map((paragraph) => paragraph.sourceText).join('\n\n')),
  };

  return { reading, paragraphs, sentences, tokenAnalyses };
}

export function generatedStoryFixture(
  seed: number,
  storySnapshotId: SnapshotId,
  createdAt = 1_700_000_500_000,
): GeneratedStory {
  return {
    id: readingId(uuid(seed * 1000)),
    kind: 'generated',
    title: 'ねこのぼうけん',
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: null,
    sentenceCount: 5,
    characterCount: 60,
    excerpt: '生成された話です。',
    translationSummary: { total: 5, completed: 5, failed: 0 },
    grammarSummary: { state: 'complete', concernCount: 0 },
    audioSummary: { total: 5, completed: 0, failed: 0 },
    analyzerVersion: 'test-analyzer-1',
    form: 'micro',
    premise: 'A cat explores the garden.',
    snapshotId: storySnapshotId,
    generationProvenanceId: uuid(seed * 1000 + 900),
    validationOutcome: { kind: 'strict' },
  };
}

export interface GeneratedDraftOptions {
  readonly seed?: number;
  readonly sentenceTexts?: readonly string[];
  /** Replaces the validation of the first token, for invariant coverage. */
  readonly firstTokenValidation?: TokenValidation;
  readonly provenance?: Partial<GenerationProvenance>;
  readonly translations?: readonly TranslationRecord[];
  readonly grammarAnalyses?: readonly GrammarAnalysisRecord[];
}

/**
 * Builds an accepted generated story exactly as the assembly service does:
 * one paragraph, one frozen validation per sentence, and provenance whose ids
 * agree with the reading's.
 */
export function generatedStoryDraftFixture(
  storySnapshotId: SnapshotId,
  options: GeneratedDraftOptions = {},
): GeneratedStoryDraft {
  const seed = options.seed ?? 7;
  const texts = options.sentenceTexts ?? ['ねこがいます。', 'ねこはねます。'];
  const createdAt = 1_700_000_500_000;

  const id = readingId(uuid(seed * 1000));
  const provenanceId = uuid(seed * 1000 + 900);
  const onlyParagraphId = paragraphId(uuid(seed * 1000 + 100));

  const sentences: Sentence[] = [];
  const tokenAnalyses: TokenAnalysis[] = [];
  const frozenValidations: FrozenSentenceValidation[] = [];

  texts.forEach((text, index) => {
    const currentSentenceId = sentenceId(uuid(seed * 1000 + 200 + index));
    sentences.push({
      id: currentSentenceId,
      readingId: id,
      paragraphId: onlyParagraphId,
      positionInReading: index,
      positionInParagraph: index,
      japaneseText: text,
      contentHash: sha256Hex(text),
    });
    const tokenId = `${currentSentenceId}-0`;
    tokenAnalyses.push({
      sentenceId: currentSentenceId,
      analyzerVersion: 'test-analyzer-1',
      tokens: [
        {
          id: tokenId,
          startUtf16: 0,
          endUtf16: text.length,
          surface: text,
          dictionaryKeys: [],
          isPunctuation: false,
        },
      ],
    });
    frozenValidations.push({
      sentenceId: currentSentenceId,
      snapshotId: storySnapshotId,
      validatorVersion: 'test-validator-1',
      tokenStatuses: [
        {
          tokenId,
          validation:
            index === 0 && options.firstTokenValidation !== undefined
              ? options.firstTokenValidation
              : { category: 'anki-exact', vocabularyItemIds: [] },
        },
      ],
    });
  });

  const sourceText = texts.join('');

  // Generated stories are translated synchronously as part of assembly, so a
  // freshly accepted story's translation summary is already fully resolved:
  // no "pending" state is ever persisted at save time.
  const translations: readonly TranslationRecord[] =
    options.translations ??
    sentences.map((sentence, index) => ({
      id: uuid(seed * 1000 + 300 + index),
      sentenceId: sentence.id,
      readingId: id,
      sourceContentHash: sentence.contentHash,
      textEn: `Sentence ${index} in English.`,
      modelId: 'vendor/text-model',
      promptVersion: 'translate-v1',
      cacheKey: `translation-${seed}-${index}`,
      createdAt,
    }));
  const grammarAnalyses: readonly GrammarAnalysisRecord[] = options.grammarAnalyses ?? [];

  const reading: GeneratedStory = {
    ...generatedStoryFixture(seed, storySnapshotId, createdAt),
    id,
    sentenceCount: sentences.length,
    characterCount: sourceText.length,
    excerpt: sourceText,
    translationSummary: {
      total: translations.length,
      completed: translations.length,
      failed: 0,
    },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: sentences.length, completed: 0, failed: 0 },
    generationProvenanceId: provenanceId,
  };

  const provenance: GenerationProvenance = {
    id: provenanceId,
    readingId: id,
    snapshotId: storySnapshotId,
    grammarProfileSnapshotId: uuid(seed * 1000 + 950),
    exceptionPolicyHash: '',
    modelId: 'vendor/text-model',
    promptVersions: { story: 'story/1' },
    repairAttempts: 0,
    suggestedVocabularyItemIds: [],
    ankiWordPriorityMode: 'uniform',
    createdAt,
    ...options.provenance,
  };

  return {
    reading,
    paragraphs: [{ id: onlyParagraphId, readingId: id, position: 0, sourceText }],
    sentences,
    tokenAnalyses,
    frozenValidations,
    provenance,
    translations,
    grammarAnalyses,
  };
}

export function snapshotFixture(seed: number, entryCount = 3): SnapshotCommit {
  const id = snapshotId(uuid(seed * 1000 + 500));
  const expressions = ['ねこ', '毎日', '見る', '犬', 'かわいい'].slice(0, entryCount);

  const items: VocabularyItem[] = expressions.map((expression, index) => ({
    id: vocabularyItemId(uuid(seed * 1000 + 600 + index)),
    snapshotId: id,
    visibleExpression: expression,
    canonicalExpression: expression,
    expressionHash: sha256Hex(expression),
    analyzedSequence: [{ surface: expression }],
  }));

  const provenance: VocabularyProvenance[] = items.map((item) => ({
    vocabularyItemId: item.id,
    sourceId: vocabularySourceId(uuid(seed * 1000 + 700)),
    sourceKind: 'anki-connect',
    sourceLabel: 'Anki · Core Japanese · Expression',
    deckName: 'Core Japanese',
    noteTypeName: 'Basic',
    fieldName: 'Expression',
  }));

  const snapshot: VocabularySnapshot = {
    id,
    createdAt: 1_700_000_100_000,
    status: 'complete',
    uniqueEntryCount: items.length,
    sourceIds: [provenance[0].sourceId],
    sourceKinds: ['anki-connect'],
    analyzerVersion: 'test-analyzer-1',
    normalizationVersion: 'test-normalizer-1',
    stats: {
      sourcesQueried: 1,
      entriesRead: items.length,
      nonEmptyValues: items.length,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 1,
      uniqueExpressions: items.length,
      sourceWarnings: [],
    },
  };

  return { snapshot, items, provenance };
}

export function readingIdFor(seed: number): ReadingId {
  return readingId(uuid(seed * 1000));
}
