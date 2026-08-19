import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GenerationStore } from '../app/application/generation/generation.store';
import { StoryAssemblyService } from '../app/application/generation/story-assembly.service';
import { VocabularyPreparationService } from '../app/application/generation/vocabulary-preparation.service';
import { GrammarProfileStore } from '../app/application/grammar/grammar-profile.store';
import { LanguageStore } from '../app/application/language/language.store';
import { VocabularyClassificationService } from '../app/application/reading/vocabulary-classification.service';
import { ExceptionPolicyStore } from '../app/application/settings/exception-policy.store';
import { AppSettingsStore } from '../app/application/settings/app-settings.store';
import { TextModelStore } from '../app/application/settings/text-model.store';
import { TEXT_GENERATION_PROVIDER } from '../app/application/shared/ai-tokens';
import { LANGUAGE_RUNTIME } from '../app/application/shared/language-tokens';
import {
  CLOCK,
  GRAMMAR_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  RANDOM_SOURCE,
  READING_REPOSITORY,
  SETTINGS_REPOSITORY,
  VOCABULARY_REPOSITORY,
} from '../app/application/shared/repository-tokens';
import type { StructuredOutputMode } from '../app/domain/ai/model-test';
import type { GrammarRepository } from '../app/domain/grammar/grammar-repository';
import type { GrammarPreset, RegisterGuidance } from '../app/domain/grammar/presets';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../app/domain/grammar/profile';
import type { AnalyzedSentence } from '../app/domain/language/analyzed-text';
import type { ClassificationMode } from '../app/domain/language/classification';
import type { LanguageError } from '../app/domain/language/language-error';
import type { ClassificationResult, SentenceTokens } from '../app/domain/language/language-runtime';
import type { StructuralBaselineEntry } from '../app/domain/language/structural-baseline';
import type { Token } from '../app/domain/reading/token';
import type { TokenValidation } from '../app/domain/reading/validation';
import { fixedClock } from '../app/domain/shared/clock';
import type { Hasher } from '../app/domain/shared/hashing';
import { snapshotId, vocabularyItemId, type SnapshotId } from '../app/domain/shared/ids';
import type { RandomSource } from '../app/domain/shared/random';
import { ok, type Result } from '../app/domain/shared/result';
import type { StorageError } from '../app/domain/storage/storage-error';
import type { ExceptionPolicy } from '../app/domain/settings/settings';
import { DEFAULT_EXCEPTION_POLICY } from '../app/domain/settings/settings';
import type { SettingsRepository } from '../app/domain/settings/settings-repository';
import type { VocabularyItem, VocabularySnapshot } from '../app/domain/vocabulary/snapshot';
import { StubTextProvider, modelTest } from './ai-fakes';
import { FakeLanguageRuntime } from './reading-fakes';
import { FakeReadingRepository } from './reading-repository-fake';
import { StubVocabularyRepository } from './vocabulary-fakes';

const FIXED_NOW = 1_700_000_000_000;

export const GENERATION_SNAPSHOT_ID: SnapshotId = snapshotId(
  '00000000-0000-4000-8000-00000000aaaa',
);

/**
 * The words the fake tokenizer knows, longest first.
 *
 * A real tokenizer is covered by the golden corpus; what these specs need is a
 * deterministic split into words a classifier can then accept or refuse, so
 * that "this story contains one word the learner has not reviewed" is an exact
 * statement rather than an approximation.
 */
const LEXICON: readonly string[] = [
  'あるきます',
  'たべます',
  'いきます',
  'のみます',
  'ねます',
  'います',
  '図書館',
  '一日',
  'ねこ',
  'へ',
  'は',
  'が',
  'の',
];

/** Reviewed vocabulary for the fixture snapshot. */
export const REVIEWED_EXPRESSIONS: readonly string[] = [
  'ねこ',
  'います',
  'ねます',
  'たべます',
  'あるきます',
  'のみます',
  'いきます',
  '一日',
];

/** Function words the structural baseline always accepts. */
const BASELINE_FORMS: readonly string[] = ['は', 'が', 'の', 'へ'];

const PUNCTUATION = new Set(['。', '、', '！', '？']);

function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  const push = (surface: string, isPunctuation: boolean): void => {
    tokens.push({
      id: `t${String(tokens.length)}`,
      startUtf16: cursor,
      endUtf16: cursor + surface.length,
      surface,
      lemma: surface,
      dictionaryKeys: [surface],
      isPunctuation,
    });
    cursor += surface.length;
  };

  while (cursor < text.length) {
    if (PUNCTUATION.has(text[cursor])) {
      push(text[cursor], true);
      continue;
    }
    const word = LEXICON.find((entry) => text.startsWith(entry, cursor));
    if (word !== undefined) {
      push(word, false);
      continue;
    }
    // An unrecognized run becomes one token, which is what an unknown word is.
    let end = cursor + 1;
    while (
      end < text.length &&
      !PUNCTUATION.has(text[end]) &&
      !LEXICON.some((entry) => text.startsWith(entry, end))
    ) {
      end += 1;
    }
    push(text.slice(cursor, end), false);
  }

  return tokens;
}

/**
 * A language runtime that tokenizes against a small lexicon and classifies
 * against a fixed reviewed list.
 *
 * It runs the real `generated` semantics: anything outside the reviewed list
 * and the baseline is `unknown`, never `not-in-snapshot`.
 */
export class GenerationLanguageRuntime extends FakeLanguageRuntime {
  /** Runs before each analysis, so a spec can cancel mid-validation. */
  beforeAnalyze: (() => void) | null = null;

  readonly reviewed = new Set<string>(REVIEWED_EXPRESSIONS);

  override analyzeSentences(
    texts: readonly string[],
  ): Promise<Result<readonly AnalyzedSentence[], LanguageError>> {
    this.beforeAnalyze?.();
    return Promise.resolve(
      ok(
        texts.map((text) => ({
          startUtf16: 0,
          endUtf16: text.length,
          text,
          tokens: tokenize(text),
        })),
      ),
    );
  }

  override classify(
    id: string,
    mode: ClassificationMode,
    sentences: readonly SentenceTokens[],
  ): Promise<Result<ClassificationResult, LanguageError>> {
    return Promise.resolve(
      ok({
        snapshotId: id,
        validatorVersion: 'validator/1',
        sentences: sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          statuses: sentence.tokens.map((token) => ({
            tokenId: token.id,
            validation: this.validationFor(token, mode),
          })),
        })),
      }),
    );
  }

  private validationFor(token: Token, mode: ClassificationMode): TokenValidation {
    if (token.isPunctuation) {
      return { category: 'punctuation' };
    }
    if (this.reviewed.has(token.surface)) {
      return {
        category: 'anki-exact',
        vocabularyItemIds: [vocabularyItemId('00000000-0000-4000-8000-000000000001')],
      };
    }
    if (BASELINE_FORMS.includes(token.surface)) {
      return { category: 'structural-baseline', ruleId: `baseline-${token.surface}` };
    }
    return mode === 'imported'
      ? { category: 'not-in-snapshot' }
      : { category: 'unknown', reason: 'not-in-vocabulary' };
  }
}

class StubGrammarRepository implements GrammarRepository {
  private stored: GrammarProfileSelection = DEFAULT_GRAMMAR_PROFILE_SELECTION;
  private readonly captures = new Map<string, GrammarProfileSnapshot>();

  getSelection(): Promise<Result<GrammarProfileSelection, StorageError>> {
    return Promise.resolve(ok(this.stored));
  }

  setSelection(selection: GrammarProfileSelection): Promise<Result<void, StorageError>> {
    this.stored = selection;
    return Promise.resolve(ok(undefined));
  }

  captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    this.captures.set(snapshot.id, snapshot);
    return Promise.resolve(ok(snapshot));
  }

  getProfileCapture(id: string): Promise<Result<GrammarProfileSnapshot | null, StorageError>> {
    return Promise.resolve(ok(this.captures.get(id) ?? null));
  }
}

type PolicySubset = Pick<SettingsRepository, 'getExceptionPolicy' | 'updateExceptionPolicy'>;

class StubPolicyRepository implements PolicySubset {
  policy: ExceptionPolicy = DEFAULT_EXCEPTION_POLICY;

  getExceptionPolicy(): Promise<Result<ExceptionPolicy, StorageError>> {
    return Promise.resolve(ok(this.policy));
  }

  updateExceptionPolicy(policy: ExceptionPolicy): Promise<Result<ExceptionPolicy, StorageError>> {
    this.policy = policy;
    return Promise.resolve(ok(this.policy));
  }
}

const PRESET: GrammarPreset = {
  id: 'mn-preset-starter',
  order: 0,
  nameEn: 'Starter forms',
  captionEn: 'the first patterns in any course',
  descriptionEn: 'Single short sentences, one idea each.',
  exampleJa: '私は学生です。',
  exampleEn: 'I am a student.',
  promptGuidance: 'Write single short clauses.',
};

const REGISTER_GUIDANCE: RegisterGuidance = { spoken: '', written: '', either: '' };

const BASELINE_ENTRIES: readonly StructuralBaselineEntry[] = BASELINE_FORMS.map((form) => ({
  id: `baseline-${form}`,
  category: 'particle' as const,
  forms: [form],
  partsOfSpeech: ['particle' as const],
  nameEn: form,
  descriptionEn: 'A function word that is always readable.',
}));

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/** Deterministic ids, so a failing assertion names something readable. */
function sequentialIds(): { nextId: () => string } {
  let next = 0;
  return {
    nextId: () => {
      next += 1;
      return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    },
  };
}

function snapshotFixture(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: GENERATION_SNAPSHOT_ID,
    createdAt: FIXED_NOW,
    status: 'complete',
    uniqueEntryCount,
    mappingIds: [],
    providerKinds: ['package'],
    analyzerVersion: 'analyzer/1',
    normalizationVersion: 'normalization/1',
    stats: {
      mappingsQueried: 1,
      reviewedEligibleNotes: uniqueEntryCount,
      nonEmptyValues: uniqueEntryCount,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: uniqueEntryCount,
      providerWarnings: [],
    },
  };
}

export interface GenerationTestBed {
  readonly store: GenerationStore;
  readonly provider: StubTextProvider;
  readonly runtime: GenerationLanguageRuntime;
  readonly readings: FakeReadingRepository;
  readonly vocabulary: StubVocabularyRepository;
  readonly policy: StubPolicyRepository;
  /** Sets the captured exception policy for the next run. */
  setPolicy(text: string): Promise<void>;
}

export interface GenerationTestBedOptions {
  readonly structuredOutput?: StructuredOutputMode | null;
  readonly modelId?: string;
  readonly uniqueEntryCount?: number;
}

/**
 * Configures a TestBed running the real generation pipeline.
 *
 * Only the provider, the language worker, storage, and time are replaced: the
 * store, the preparation, the assembly, and every domain rule are the real
 * ones, so a run in these specs makes the same decisions the application does.
 */
export function configureGenerationTestBed(
  options: GenerationTestBedOptions = {},
): GenerationTestBed {
  // A spec may need a second bed with different settings inside one test, so
  // the previous module is torn down rather than refusing to be reconfigured.
  TestBed.resetTestingModule();
  const provider = new StubTextProvider(ok(modelTest()));
  const runtime = new GenerationLanguageRuntime();
  const readings = new FakeReadingRepository();
  const vocabulary = new StubVocabularyRepository();
  const policyRepository = new StubPolicyRepository();

  const snapshot = snapshotFixture(options.uniqueEntryCount ?? REVIEWED_EXPRESSIONS.length);
  vocabulary.snapshots.push(snapshot);
  vocabulary.activeSnapshotId = snapshot.id;
  vocabulary.items.push(
    ...REVIEWED_EXPRESSIONS.map<VocabularyItem>((expression, index) => ({
      id: vocabularyItemId(`00000000-0000-4000-8000-1000${String(index).padStart(8, '0')}`),
      snapshotId: snapshot.id,
      visibleExpression: expression,
      canonicalExpression: expression,
      expressionHash: `h(${expression})`,
      analyzedSequence: [{ surface: expression }],
    })),
  );

  const random: RandomSource = { nextInt: () => 0 };

  TestBed.configureTestingModule({
    providers: [
      GenerationStore,
      GrammarProfileStore,
      ExceptionPolicyStore,
      StoryAssemblyService,
      VocabularyPreparationService,
      VocabularyClassificationService,
      { provide: TEXT_GENERATION_PROVIDER, useValue: provider },
      { provide: LANGUAGE_RUNTIME, useValue: runtime },
      { provide: READING_REPOSITORY, useValue: readings },
      { provide: VOCABULARY_REPOSITORY, useValue: vocabulary },
      { provide: GRAMMAR_REPOSITORY, useValue: new StubGrammarRepository() },
      { provide: SETTINGS_REPOSITORY, useValue: policyRepository },
      { provide: RANDOM_SOURCE, useValue: random },
      { provide: HASHER, useValue: TEST_HASHER },
      { provide: CLOCK, useValue: fixedClock(FIXED_NOW) },
      { provide: ID_GENERATOR, useValue: sequentialIds() },
      {
        provide: LanguageStore,
        useValue: {
          initialize: () => Promise.resolve(true),
          grammarPresets: signal<readonly GrammarPreset[]>([PRESET]),
          registerGuidance: signal<RegisterGuidance | null>(REGISTER_GUIDANCE),
          versions: signal({ structuralBaselineVersion: '1.0.0' }),
          structuralBaseline: signal<readonly StructuralBaselineEntry[]>(BASELINE_ENTRIES),
        },
      },
      {
        provide: AppSettingsStore,
        useValue: { activeSnapshotId: signal<SnapshotId | null>(snapshot.id) },
      },
      {
        provide: TextModelStore,
        useValue: {
          settings: signal({
            modelId: options.modelId ?? 'vendor/text-model',
            lastTestFingerprint: 'fingerprint',
            lastTestedAt: FIXED_NOW,
            // `null` is a deliberate value here — it is the untested state —
            // so only an absent option falls back to the tested default.
            structuredOutput:
              'structuredOutput' in options ? options.structuredOutput : 'native-schema',
          }),
        },
      },
    ],
  });

  const store = TestBed.inject(GenerationStore);
  const policy = TestBed.inject(ExceptionPolicyStore);

  return {
    store,
    provider,
    runtime,
    readings,
    vocabulary,
    policy: policyRepository,
    setPolicy: async (text: string) => {
      policy.setDraft(text);
      await policy.save();
    },
  };
}

/** A four-sentence story every word of which is reviewed. */
export function strictStory(): {
  readonly titleJa: string;
  readonly sentences: readonly { readonly index: number; readonly textJa: string }[];
} {
  return story(['ねこがいます。', 'ねこはねます。', 'ねこはたべます。', 'ねこはあるきます。']);
}

/** The same story with one word the learner has never reviewed. */
export function storyWithUnknown(): ReturnType<typeof strictStory> {
  return story([
    'ねこがいます。',
    'ねこは図書館へいきます。',
    'ねこはたべます。',
    'ねこはあるきます。',
  ]);
}

/** A well-formed story of the wrong length, which is repairable, not malformed. */
export function shortStory(): ReturnType<typeof strictStory> {
  return story(['ねこがいます。', 'ねこはねます。']);
}

export function story(
  sentences: readonly string[],
  titleJa = 'ねこの一日',
): { readonly titleJa: string; readonly sentences: readonly { index: number; textJa: string }[] } {
  return {
    titleJa,
    sentences: sentences.map((textJa, index) => ({ index, textJa })),
  };
}
