import type { AudioDecoder } from '../app/infrastructure/openrouter/audio-decode';
import { OpenRouterEnricher } from '../app/infrastructure/openrouter/enrichment.adapter';
import { OpenRouterClient } from '../app/infrastructure/openrouter/openrouter-client';
import { OpenRouterTextProvider } from '../app/infrastructure/openrouter/openrouter-text-provider';
import { OpenRouterTextToSpeechProvider } from '../app/infrastructure/openrouter/openrouter-tts.provider';
import { OpenRouterTtsSynthesizer } from '../app/infrastructure/openrouter/tts-synthesis.adapter';
import { OpenRouterStoryGenerator } from '../app/infrastructure/openrouter/story-generation.adapter';
import { OpenRouterTextModelTester } from '../app/infrastructure/openrouter/text-model-test.adapter';
import { OpenRouterTtsTester } from '../app/infrastructure/openrouter/tts-test.adapter';
import { aiError, type AiError } from '../app/domain/ai/ai-error';
import type { AiTask } from '../app/domain/ai/ai-task';
import type { ExceptionDecision } from '../app/domain/ai/exception-review';
import type {
  GrammarReviewRequest,
  GrammarReviewResult,
} from '../app/domain/ai/grammar-review-request';
import type { StoryCandidate, StoryGenerationRequest } from '../app/domain/ai/story-request';
import type { ModelTest, TextModelConfig, TtsConfig, TtsTest } from '../app/domain/ai/model-test';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
  TextGenerationProvider,
  TextTaskConfig,
} from '../app/domain/ai/text-generation-provider';
import type {
  AudioPayload,
  TextToSpeechProvider,
  TtsRequest,
} from '../app/domain/ai/text-to-speech-provider';
import type {
  TranslationBatchRequest,
  TranslationResult,
} from '../app/domain/ai/translation-request';
import type { CredentialStatus } from '../app/domain/settings/credential';
import type { CredentialRepository } from '../app/domain/settings/credential-repository';
import type { SettingsRepository } from '../app/domain/settings/settings-repository';
import {
  DEFAULT_EXCEPTION_POLICY,
  DEFAULT_TEXT_MODEL_SETTINGS,
  DEFAULT_TTS_SETTINGS,
  type ExceptionPolicy,
  type TextModelSettings,
  type TtsSettings,
} from '../app/domain/settings/settings';
import { err, ok, type Result } from '../app/domain/shared/result';
import { storageError, type StorageError } from '../app/domain/storage/storage-error';
import {
  FAKE_OPENROUTER,
  FakeOpenRouterServer,
  type FakeOpenRouterOptions,
} from './openrouter-server';

/**
 * In-memory credential repository with the same exposure rules as the real one:
 * the key is readable only inside `useApiKey`.
 */
export class FakeCredentialRepository implements CredentialRepository {
  private apiKey: string | null;
  private createdAt: number | null;
  private updatedAt: number | null;
  private now = 1_000;

  constructor(apiKey: string | null = FAKE_OPENROUTER.apiKey) {
    this.apiKey = apiKey;
    this.createdAt = apiKey === null ? null : this.now;
    this.updatedAt = apiKey === null ? null : this.now;
  }

  getStatus(): Promise<Result<CredentialStatus, StorageError>> {
    return Promise.resolve(ok(this.status()));
  }

  replace(apiKey: string): Promise<Result<CredentialStatus, StorageError>> {
    const trimmed = apiKey.trim();
    if (trimmed === '') {
      return Promise.resolve(err(storageError('conflict', 'The key was empty.')));
    }
    this.now += 1;
    this.apiKey = trimmed;
    this.createdAt ??= this.now;
    this.updatedAt = this.now;
    return Promise.resolve(ok(this.status()));
  }

  remove(): Promise<Result<CredentialStatus, StorageError>> {
    this.now += 1;
    this.apiKey = null;
    this.createdAt = null;
    this.updatedAt = null;
    return Promise.resolve(ok(this.status()));
  }

  async useApiKey<T>(use: (apiKey: string) => Promise<T>): Promise<Result<T, StorageError>> {
    if (this.apiKey === null) {
      return err(storageError('not-found', 'No OpenRouter key is saved.'));
    }
    return ok(await use(this.apiKey));
  }

  private status(): CredentialStatus {
    return {
      isConfigured: this.apiKey !== null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/** Credential repository whose storage is broken in a specific way. */
export function failingCredentials(code: 'unavailable' | 'corrupt-record'): CredentialRepository {
  const failure = storageError(code, 'The credential store failed.');
  return {
    getStatus: () => Promise.resolve(err(failure)),
    replace: () => Promise.resolve(err(failure)),
    remove: () => Promise.resolve(err(failure)),
    useApiKey: () => Promise.resolve(err(failure)),
  };
}

/** Decoder that answers without a browser audio stack. */
export function fakeAudioDecoder(decodable = true): AudioDecoder {
  return { canDecode: () => Promise.resolve(decodable) };
}

export interface OpenRouterHarness {
  readonly server: FakeOpenRouterServer;
  readonly client: OpenRouterClient;
  readonly text: OpenRouterTextProvider;
  readonly tts: OpenRouterTextToSpeechProvider;
  /** Every backoff wait the client performed, in order. */
  readonly sleeps: number[];
}

export interface HarnessOptions extends FakeOpenRouterOptions {
  readonly credentials?: CredentialRepository;
  readonly online?: boolean;
  readonly decodable?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Wires the real adapters to the fake server.
 *
 * Backoff waits are recorded instead of slept and randomness is fixed, so retry
 * behaviour is asserted by call count and delay rather than by elapsed time.
 */
export function openRouterHarness(options: HarnessOptions = {}): OpenRouterHarness {
  const server = new FakeOpenRouterServer(options);
  const sleeps: number[] = [];
  const client = new OpenRouterClient({
    fetchFn: server.fetch,
    credentials: options.credentials ?? new FakeCredentialRepository(),
    isOnline: () => options.online ?? true,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    correlationId: () => 'test-correlation',
    ...(options.timeoutMs === undefined ? {} : { defaultTimeoutMs: options.timeoutMs }),
  });

  return {
    server,
    client,
    sleeps,
    text: new OpenRouterTextProvider(
      new OpenRouterTextModelTester(client),
      () => Promise.resolve(new OpenRouterStoryGenerator(client)),
      () => Promise.resolve(new OpenRouterEnricher(client)),
    ),
    tts: (() => {
      const decoder = fakeAudioDecoder(options.decodable ?? true);
      return new OpenRouterTextToSpeechProvider(new OpenRouterTtsTester(client, decoder), () =>
        Promise.resolve(new OpenRouterTtsSynthesizer(client, decoder)),
      );
    })(),
  };
}

/**
 * Text provider that answers from memory, for application-layer tests.
 *
 * Generation answers come from per-method queues rather than from one
 * configurable result, because the scenarios that matter are sequences: a
 * story, then a review, then a repair. Running a queue dry is a failure rather
 * than a repeated last answer, so a test that expects three provider calls
 * cannot quietly pass while the store makes four.
 */
export class StubTextProvider implements TextGenerationProvider {
  calls = 0;

  readonly generationCalls = { story: 0, repair: 0, review: 0, grammar: 0, translate: 0 };
  /** Every request that reached the provider, for prompt-content assertions. */
  readonly storyRequests: StoryGenerationRequest[] = [];
  readonly repairRequests: StoryRepairRequest[] = [];
  readonly reviewRequests: ExceptionReviewRequest[] = [];
  readonly grammarRequests: GrammarReviewRequest[] = [];
  readonly translationRequests: TranslationBatchRequest[] = [];
  readonly configs: TextTaskConfig[] = [];

  readonly storyQueue: Result<StoryCandidate, AiError>[] = [];
  readonly repairQueue: Result<StoryCandidate, AiError>[] = [];
  readonly reviewQueue: Result<readonly ExceptionDecision[], AiError>[] = [];
  readonly grammarQueue: Result<GrammarReviewResult, AiError>[] = [];
  readonly translationQueue: Result<readonly TranslationResult[], AiError>[] = [];

  /** Runs just before each generation answer, so a test can cancel mid-flight. */
  beforeAnswer: (() => void) | null = null;

  /**
   * Answers translation requests directly instead of from the queue.
   *
   * A whole-reading job makes as many requests as its batching decides, which
   * is the thing under test, so a queue primed with a fixed number of answers
   * would decide the expected count in advance.
   */
  translateWith:
    ((request: TranslationBatchRequest) => Result<readonly TranslationResult[], AiError>) | null =
    null;

  constructor(private outcome: Result<ModelTest, AiError>) {}

  set result(outcome: Result<ModelTest, AiError>) {
    this.outcome = outcome;
  }

  testConfiguration(
    config: TextModelConfig,
    signal?: AbortSignal,
  ): Promise<Result<ModelTest, AiError>> {
    this.calls += 1;
    void config;
    void signal;
    return Promise.resolve(this.outcome);
  }

  generateStory(
    request: StoryGenerationRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    this.generationCalls.story += 1;
    this.storyRequests.push(request);
    this.configs.push(config);
    return this.answer('story-generation', this.storyQueue, signal);
  }

  repairStory(
    request: StoryRepairRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<StoryCandidate, AiError>> {
    this.generationCalls.repair += 1;
    this.repairRequests.push(request);
    this.configs.push(config);
    return this.answer('story-repair', this.repairQueue, signal);
  }

  reviewExceptions(
    request: ExceptionReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly ExceptionDecision[], AiError>> {
    this.generationCalls.review += 1;
    this.reviewRequests.push(request);
    this.configs.push(config);
    return this.answer('exception-review', this.reviewQueue, signal);
  }

  reviewGrammar(
    request: GrammarReviewRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<GrammarReviewResult, AiError>> {
    this.generationCalls.grammar += 1;
    this.grammarRequests.push(request);
    this.configs.push(config);
    return this.answer('grammar-review', this.grammarQueue, signal);
  }

  translate(
    request: TranslationBatchRequest,
    config: TextTaskConfig,
    signal?: AbortSignal,
  ): Promise<Result<readonly TranslationResult[], AiError>> {
    this.generationCalls.translate += 1;
    this.translationRequests.push(request);
    this.configs.push(config);
    if (this.translateWith !== null) {
      this.translationQueue.push(this.translateWith(request));
    }
    return this.answer('translation', this.translationQueue, signal);
  }

  private answer<T>(
    task: AiTask,
    queue: Result<T, AiError>[],
    signal?: AbortSignal,
  ): Promise<Result<T, AiError>> {
    this.beforeAnswer?.();
    if (signal?.aborted === true) {
      return Promise.resolve(err(aiError('cancelled', task, 'The request was cancelled.')));
    }
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`StubTextProvider received an unexpected ${task} request`);
    }
    return Promise.resolve(next);
  }
}

/** Speech provider that answers from memory, for application-layer tests. */
export class StubTtsProvider implements TextToSpeechProvider {
  calls = 0;

  /** Every synthesis request that reached the provider, in order. */
  readonly synthesized: TtsRequest[] = [];

  /**
   * Answers synthesis directly rather than from a queue.
   *
   * How many clips a whole-reading job asks for is the thing under test, so a
   * queue primed with a fixed number of answers would decide the expected count
   * in advance. The default answers every request with a small valid clip.
   */
  synthesizeWith: (request: TtsRequest) => Result<AudioPayload, AiError> = () => ok(audioPayload());

  constructor(private outcome: Result<TtsTest, AiError>) {}

  set result(outcome: Result<TtsTest, AiError>) {
    this.outcome = outcome;
  }

  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>> {
    this.calls += 1;
    void config;
    void signal;
    return Promise.resolve(this.outcome);
  }

  synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>> {
    this.synthesized.push(input);
    if (signal.aborted) {
      return Promise.resolve(
        err(aiError('cancelled', 'tts-synthesis', 'The request was cancelled.')),
      );
    }
    return Promise.resolve(this.synthesizeWith(input));
  }
}

/** A small clip that stands in for a real MP3 in application-layer tests. */
export function audioPayload(byteLength = 512, speedApplied = true): AudioPayload {
  return { bytes: new ArrayBuffer(byteLength), mimeType: 'audio/mpeg', speedApplied };
}

/**
 * The settings rows the AI stores read and write.
 *
 * Only these six methods are stubbed: the app, reader-preference, and
 * language-asset rows belong to other stores, and empty bodies for them would
 * assert nothing.
 */
export type AiSettingsSubset = Pick<
  SettingsRepository,
  | 'getTextModelSettings'
  | 'updateTextModelSettings'
  | 'getTtsSettings'
  | 'updateTtsSettings'
  | 'getExceptionPolicy'
  | 'updateExceptionPolicy'
>;

export class StubAiSettingsRepository implements AiSettingsSubset {
  textModel: TextModelSettings = DEFAULT_TEXT_MODEL_SETTINGS;
  tts: TtsSettings = DEFAULT_TTS_SETTINGS;
  policy: ExceptionPolicy = DEFAULT_EXCEPTION_POLICY;

  /** Set to make the next write fail, for revert and failure-copy coverage. */
  failWrites: StorageError | null = null;
  failReads: StorageError | null = null;

  getTextModelSettings(): Promise<Result<TextModelSettings, StorageError>> {
    return Promise.resolve(this.failReads === null ? ok(this.textModel) : err(this.failReads));
  }

  updateTextModelSettings(
    patch: Partial<TextModelSettings>,
  ): Promise<Result<TextModelSettings, StorageError>> {
    if (this.failWrites !== null) {
      return Promise.resolve(err(this.failWrites));
    }
    this.textModel = { ...this.textModel, ...patch };
    return Promise.resolve(ok(this.textModel));
  }

  getTtsSettings(): Promise<Result<TtsSettings, StorageError>> {
    return Promise.resolve(this.failReads === null ? ok(this.tts) : err(this.failReads));
  }

  updateTtsSettings(patch: Partial<TtsSettings>): Promise<Result<TtsSettings, StorageError>> {
    if (this.failWrites !== null) {
      return Promise.resolve(err(this.failWrites));
    }
    this.tts = { ...this.tts, ...patch };
    return Promise.resolve(ok(this.tts));
  }

  getExceptionPolicy(): Promise<Result<ExceptionPolicy, StorageError>> {
    return Promise.resolve(this.failReads === null ? ok(this.policy) : err(this.failReads));
  }

  updateExceptionPolicy(policy: ExceptionPolicy): Promise<Result<ExceptionPolicy, StorageError>> {
    if (this.failWrites !== null) {
      return Promise.resolve(err(this.failWrites));
    }
    this.policy = policy;
    return Promise.resolve(ok(this.policy));
  }
}

/** A passing text-model test result. */
export function modelTest(modelId = FAKE_OPENROUTER.textModel): ModelTest {
  return { modelId, structuredOutput: 'native-schema' };
}

/** A passing TTS test result, with a clip small enough to keep in memory. */
export function ttsTest(speedApplied = true): TtsTest {
  const bytes = new ArrayBuffer(1024);
  return {
    modelId: FAKE_OPENROUTER.ttsModel,
    voiceId: FAKE_OPENROUTER.voice,
    speedApplied,
    mimeType: 'audio/mpeg',
    byteLength: bytes.byteLength,
    sample: new Blob([bytes], { type: 'audio/mpeg' }),
  };
}

/**
 * Wires a stub provider to answer grammar review and translation successfully
 * by default, so specs about the story/exception-review/repair states do not
 * each have to queue an auxiliary answer they are not testing.
 *
 * It only fills in a request that has not already been answered: a spec that
 * pushes its own `grammarQueue`/`translationQueue` entry to test a failure
 * still gets that entry consumed first, because `answer()` shifts in FIFO
 * order and this pushes after whatever the spec already queued.
 */
export function autoAnswerAuxiliary(provider: StubTextProvider): void {
  let answeredGrammar = 0;
  let answeredTranslation = 0;
  const previous = provider.beforeAnswer;
  provider.beforeAnswer = () => {
    previous?.();
    if (provider.grammarRequests.length > answeredGrammar) {
      provider.grammarQueue.push(ok({ findings: [] }));
      answeredGrammar = provider.grammarRequests.length;
    }
    if (provider.translationRequests.length > answeredTranslation) {
      const request = provider.translationRequests[provider.translationRequests.length - 1];
      provider.translationQueue.push(
        ok(
          request.sentences.map((sentence) => ({
            id: sentence.id,
            textEn: `EN: ${sentence.textJa}`,
          })),
        ),
      );
      answeredTranslation = provider.translationRequests.length;
    }
  };
}
