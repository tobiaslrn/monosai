import {
  ANALYZER_VERSION,
  SEGMENTATION_RULES_VERSION,
  VALIDATOR_VERSION,
} from '../../app/domain/language/analyzer-version';
import type { AnalyzedSentence } from '../../app/domain/language/analyzed-text';
import { classifyTokens } from '../../app/domain/language/classification';
import type { ClassifiedSentence } from '../../app/domain/language/language-runtime';
import { languageError, type LanguageError } from '../../app/domain/language/language-error';
import {
  activeVersionsOf,
  type LanguageAssetManifest,
} from '../../app/domain/language/language-assets';
import { segmentParagraph } from '../../app/domain/language/segmentation';
import {
  compileStructuralBaseline,
  type StructuralBaselineMatcher,
} from '../../app/domain/language/structural-baseline';
import {
  compileVocabularyMatcher,
  type VocabularyMatcher,
} from '../../app/domain/language/vocabulary-matcher';
import { describeThrown } from '../../app/domain/shared/errors';
import type { Token } from '../../app/domain/reading/token';
import {
  dictionaryAssetHeaderSchema,
  findInvalidDictionaryEntry,
  grammarPresetsAssetSchema,
  structuralBaselineAssetSchema,
  type RawDictionaryEntry,
} from '../../app/infrastructure/language/language-asset.schema';
import {
  loadAssetFile,
  loadAssetJson,
  type AssetFetchContext,
} from '../../app/infrastructure/language/language-asset-cache';
import {
  LANGUAGE_PROTOCOL_VERSION,
  type InitializeResult,
  type LanguageRequest,
  type LanguageResponseMessage,
  type LanguageResult,
} from '../../app/infrastructure/language/worker-protocol';
import { languageRequestMessageSchema } from '../../app/infrastructure/language/worker-protocol.schema';
import { DictionaryIndex } from './dictionary-index';
import { mapRawTokens, TokenAlignmentError } from './token-mapping';
import type { TokenizerRuntime, TokenizerRuntimeFactory } from './tokenizer-runtime';

/** Characters analyzed between cancellation checks. */
const DEFAULT_CHUNK_CHARACTERS = 2_000;

type Dispatched =
  | { readonly ok: true; readonly value: LanguageResult }
  | { readonly ok: false; readonly error: LanguageError };

export interface LanguageWorkerHostDependencies {
  readonly post: (message: LanguageResponseMessage) => void;
  readonly createTokenizer: TokenizerRuntimeFactory;
  readonly fetchFn: typeof fetch;
  readonly cacheStorage: CacheStorage | null;
  readonly chunkCharacters?: number;
  readonly yieldControl?: () => Promise<void>;
}

interface ReadyState {
  readonly tokenizer: TokenizerRuntime;
  readonly dictionary: DictionaryIndex;
  readonly baseline: StructuralBaselineMatcher;
  readonly result: InitializeResult;
}

interface CompiledSnapshot {
  readonly snapshotId: string;
  readonly matcher: VocabularyMatcher;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function notInitialized(): LanguageError {
  return languageError('not-initialized', 'The language worker has not been initialized yet.');
}

function snapshotNotCompiled(): LanguageError {
  return languageError(
    'snapshot-not-compiled',
    'The requested vocabulary snapshot has not been compiled in this worker.',
  );
}

function cancelledError(): LanguageError {
  return languageError('cancelled', 'The request was cancelled.');
}

function readRequestId(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const candidate = (data as { requestId?: unknown }).requestId;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return '';
}

/**
 * Handles the language worker protocol.
 *
 * The message loop lives here rather than in the worker entry point so tests can
 * drive it directly, where the Worker global does not exist. It owns
 * initialization, the compiled snapshot matcher, and cooperative cancellation:
 * long analyses yield between chunks so a cancel message can be delivered, and a
 * cancelled request answers with the cancelled error instead of a stale result.
 */
export class LanguageWorkerHost {
  private ready: ReadyState | null = null;
  private snapshot: CompiledSnapshot | null = null;
  private readonly cancelled = new Set<string>();

  constructor(private readonly dependencies: LanguageWorkerHostDependencies) {}

  async handleMessage(data: unknown): Promise<void> {
    const parsed = languageRequestMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.fail(
        readRequestId(data),
        languageError('invalid-request', 'The language worker received an unusable message.'),
      );
      return;
    }

    const { protocolVersion, requestId, request } = parsed.data;
    if (protocolVersion !== LANGUAGE_PROTOCOL_VERSION) {
      this.fail(
        requestId,
        languageError(
          'protocol-version-mismatch',
          'The language worker speaks a different protocol version.',
          `client ${String(protocolVersion)}, worker ${String(LANGUAGE_PROTOCOL_VERSION)}`,
        ),
      );
      return;
    }

    if (request.operation === 'cancel') {
      this.cancelled.add(request.payload.targetRequestId);
      this.succeed(requestId, { operation: 'cancel', value: { cancelled: true } });
      return;
    }

    try {
      const result = await this.dispatch(requestId, request);
      if (this.cancelled.has(requestId)) {
        this.fail(requestId, cancelledError());
        return;
      }
      if (result.ok) {
        this.succeed(requestId, result.value);
      } else {
        this.fail(requestId, result.error);
      }
    } catch (thrown) {
      this.fail(
        requestId,
        languageError(
          'analysis-failed',
          'The language worker could not complete the request.',
          describeThrown(thrown),
        ),
      );
    } finally {
      this.cancelled.delete(requestId);
    }
  }

  private succeed(requestId: string, result: LanguageResult): void {
    this.dependencies.post({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: { ok: true, result },
    });
  }

  private fail(requestId: string, error: LanguageError): void {
    this.dependencies.post({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId,
      outcome: { ok: false, error },
    });
  }

  private async dispatch(
    requestId: string,
    request: Exclude<LanguageRequest, { operation: 'cancel' }>,
  ): Promise<Dispatched> {
    switch (request.operation) {
      case 'initialize': {
        const initialized = await this.initialize(
          request.payload.baseUrl,
          request.payload.manifest,
        );
        return initialized.ok
          ? { ok: true, value: { operation: 'initialize', value: initialized.value } }
          : initialized;
      }
      case 'segment':
        return {
          ok: true,
          value: { operation: 'segment', value: segmentParagraph(request.payload.text) },
        };
      case 'analyze':
        return this.analyze(requestId, request.payload.text, request.payload.unit);
      case 'analyze-sentences':
        return this.analyzeSentences(requestId, request.payload.texts);
      case 'lookup': {
        const ready = this.ready;
        if (ready === null) {
          return { ok: false, error: notInitialized() };
        }
        return {
          ok: true,
          value: { operation: 'lookup', value: ready.dictionary.lookup(request.payload.query) },
        };
      }
      case 'compile-snapshot': {
        this.snapshot = {
          snapshotId: request.payload.snapshotId,
          matcher: compileVocabularyMatcher(request.payload.items),
        };
        return {
          ok: true,
          value: {
            operation: 'compile-snapshot',
            value: {
              snapshotId: request.payload.snapshotId,
              itemCount: request.payload.items.length,
            },
          },
        };
      }
      case 'classify':
        return this.classify(requestId, request.payload);
    }
  }

  private async initialize(
    baseUrl: string,
    manifest: LanguageAssetManifest,
  ): Promise<{ ok: true; value: InitializeResult } | { ok: false; error: LanguageError }> {
    const context: AssetFetchContext = {
      baseUrl,
      bundleVersion: manifest.bundleVersion,
      fetchFn: this.dependencies.fetchFn,
      cacheStorage: this.dependencies.cacheStorage,
    };

    const components = manifest.components;
    if (
      components.tokenizer.files.length === 0 ||
      components.dictionary.files.length === 0 ||
      components.grammarPresets.files.length === 0 ||
      components.structuralBaseline.files.length === 0
    ) {
      return {
        ok: false,
        error: languageError('asset-manifest-invalid', 'The language manifest is incomplete.'),
      };
    }
    const tokenizerFile = components.tokenizer.files[0];
    const dictionaryFile = components.dictionary.files[0];
    const presetsFile = components.grammarPresets.files[0];
    const baselineFile = components.structuralBaseline.files[0];

    const dictionaryJson = await loadAssetJson(context, dictionaryFile);
    if (!dictionaryJson.ok) {
      return dictionaryJson;
    }
    const dictionaryHeader = dictionaryAssetHeaderSchema.safeParse(dictionaryJson.value);
    const entries = (dictionaryJson.value as { entries?: unknown }).entries;
    const invalidEntry = findInvalidDictionaryEntry(entries);
    if (!dictionaryHeader.success || invalidEntry !== null) {
      return {
        ok: false,
        error: languageError(
          'asset-schema-invalid',
          'The bundled dictionary does not match its schema.',
          invalidEntry === null
            ? 'invalid header'
            : `invalid entry at index ${String(invalidEntry)}`,
        ),
      };
    }

    const presetsJson = await loadAssetJson(context, presetsFile);
    if (!presetsJson.ok) {
      return presetsJson;
    }
    const presets = grammarPresetsAssetSchema.safeParse(presetsJson.value);
    if (!presets.success) {
      return {
        ok: false,
        error: languageError(
          'asset-schema-invalid',
          'The grammar presets do not match their schema.',
        ),
      };
    }

    const baselineJson = await loadAssetJson(context, baselineFile);
    if (!baselineJson.ok) {
      return baselineJson;
    }
    const baselineAsset = structuralBaselineAssetSchema.safeParse(baselineJson.value);
    if (!baselineAsset.success) {
      return {
        ok: false,
        error: languageError(
          'asset-schema-invalid',
          'The structural baseline does not match its schema.',
        ),
      };
    }

    const tokenizerBytes = await loadAssetFile(context, tokenizerFile);
    if (!tokenizerBytes.ok) {
      return tokenizerBytes;
    }

    let tokenizer: TokenizerRuntime;
    try {
      tokenizer = await this.dependencies.createTokenizer(tokenizerBytes.value);
    } catch (thrown) {
      return {
        ok: false,
        error: languageError(
          'tokenizer-initialization-failed',
          'The Japanese tokenizer could not start.',
          describeThrown(thrown),
        ),
      };
    }

    let dictionary: DictionaryIndex;
    try {
      dictionary = DictionaryIndex.build(entries as readonly RawDictionaryEntry[]);
    } catch (thrown) {
      return {
        ok: false,
        error: languageError(
          'dictionary-initialization-failed',
          'The bundled dictionary index could not be built.',
          describeThrown(thrown),
        ),
      };
    }

    const result: InitializeResult = {
      bundleVersion: manifest.bundleVersion,
      versions: activeVersionsOf(manifest),
      analyzerVersion: ANALYZER_VERSION,
      dictionaryEntryCount: dictionary.size,
      structuralBaselineEntries: baselineAsset.data.entries,
      grammarPresets: presets.data.presets,
      registerGuidance: presets.data.registerGuidance,
    };
    this.ready = {
      tokenizer,
      dictionary,
      baseline: compileStructuralBaseline({
        version: baselineAsset.data.version,
        entries: baselineAsset.data.entries,
      }),
      result,
    };
    return { ok: true, value: result };
  }

  private async analyze(
    requestId: string,
    text: string,
    unit: 'paragraph' | 'sentence',
  ): Promise<Dispatched> {
    const segments =
      unit === 'sentence'
        ? [{ startUtf16: 0, endUtf16: text.length, text }]
        : segmentParagraph(text);
    const analyzed = await this.tokenizeSegments(requestId, segments);
    if (!analyzed.ok) {
      return analyzed;
    }

    return {
      ok: true,
      value: {
        operation: 'analyze',
        value: {
          analyzerVersion: ANALYZER_VERSION,
          segmentationRulesVersion: SEGMENTATION_RULES_VERSION,
          sentences: analyzed.value,
        },
      },
    };
  }

  /**
   * Tokenizes sentences whose boundaries the caller already decided. Import
   * review corrects boundaries, so re-segmenting here would discard the
   * correction the learner just made.
   */
  private async analyzeSentences(requestId: string, texts: readonly string[]): Promise<Dispatched> {
    const segments = texts.map((text) => ({
      startUtf16: 0,
      endUtf16: text.length,
      text,
    }));
    const analyzed = await this.tokenizeSegments(requestId, segments);
    return analyzed.ok
      ? { ok: true, value: { operation: 'analyze-sentences', value: analyzed.value } }
      : analyzed;
  }

  /**
   * Tokenizes segments, yielding between chunks so a cancel message can be
   * delivered rather than queued behind a long synchronous run.
   */
  private async tokenizeSegments(
    requestId: string,
    segments: readonly { startUtf16: number; endUtf16: number; text: string }[],
  ): Promise<
    | { readonly ok: true; readonly value: readonly AnalyzedSentence[] }
    | {
        readonly ok: false;
        readonly error: LanguageError;
      }
  > {
    const ready = this.ready;
    if (ready === null) {
      return { ok: false, error: notInitialized() };
    }

    const chunkCharacters = this.dependencies.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS;
    const yieldControl = this.dependencies.yieldControl ?? defaultYield;
    const sentences: AnalyzedSentence[] = [];
    let sinceYield = 0;

    for (const segment of segments) {
      if (this.cancelled.has(requestId)) {
        return { ok: false, error: cancelledError() };
      }
      let tokens: readonly Token[];
      try {
        tokens = mapRawTokens(segment.text, ready.tokenizer.tokenize(segment.text));
      } catch (thrown) {
        return {
          ok: false,
          error: languageError(
            'analysis-failed',
            thrown instanceof TokenAlignmentError
              ? 'Analysis did not line up with the source text.'
              : 'The text could not be analyzed.',
            describeThrown(thrown),
          ),
        };
      }
      sentences.push({ ...segment, tokens });
      sinceYield += segment.text.length;
      if (sinceYield >= chunkCharacters) {
        sinceYield = 0;
        await yieldControl();
      }
    }

    return { ok: true, value: sentences };
  }

  private async classify(
    requestId: string,
    payload: {
      readonly snapshotId: string;
      readonly mode: 'imported' | 'generated';
      readonly sentences: readonly {
        readonly sentenceId: string;
        readonly tokens: readonly Token[];
      }[];
    },
  ): Promise<Dispatched> {
    const ready = this.ready;
    if (ready === null) {
      return { ok: false, error: notInitialized() };
    }
    const snapshot = this.snapshot;
    if (snapshot === null) {
      return { ok: false, error: snapshotNotCompiled() };
    }
    if (snapshot.snapshotId !== payload.snapshotId) {
      return { ok: false, error: snapshotNotCompiled() };
    }

    const yieldControl = this.dependencies.yieldControl ?? defaultYield;
    const chunkTokens = this.dependencies.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS;
    const classified: ClassifiedSentence[] = [];
    let sinceYield = 0;

    for (const sentence of payload.sentences) {
      if (this.cancelled.has(requestId)) {
        return { ok: false, error: cancelledError() };
      }
      classified.push({
        sentenceId: sentence.sentenceId,
        statuses: classifyTokens(sentence.tokens, {
          mode: payload.mode,
          vocabulary: snapshot.matcher,
          baseline: ready.baseline,
        }),
      });
      sinceYield += sentence.tokens.length;
      if (sinceYield >= chunkTokens) {
        sinceYield = 0;
        await yieldControl();
      }
    }

    return {
      ok: true,
      value: {
        operation: 'classify',
        value: {
          snapshotId: payload.snapshotId,
          validatorVersion: VALIDATOR_VERSION,
          sentences: classified,
        },
      },
    };
  }
}
