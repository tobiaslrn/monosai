import type { AudioDecoder } from '../app/infrastructure/openrouter/audio-decode';
import { OpenRouterClient } from '../app/infrastructure/openrouter/openrouter-client';
import { OpenRouterTextModelTester } from '../app/infrastructure/openrouter/text-model-test.adapter';
import { OpenRouterTtsTester } from '../app/infrastructure/openrouter/tts-test.adapter';
import type { AiError } from '../app/domain/ai/ai-error';
import type { ModelTest, TextModelConfig, TtsConfig, TtsTest } from '../app/domain/ai/model-test';
import type { TextGenerationProvider } from '../app/domain/ai/text-generation-provider';
import type { TextToSpeechProvider } from '../app/domain/ai/text-to-speech-provider';
import type { CredentialStatus } from '../app/domain/settings/credential';
import type { CredentialRepository } from '../app/domain/settings/credential-repository';
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
  readonly text: OpenRouterTextModelTester;
  readonly tts: OpenRouterTtsTester;
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
    text: new OpenRouterTextModelTester(client),
    tts: new OpenRouterTtsTester(client, fakeAudioDecoder(options.decodable ?? true)),
  };
}

/** Text provider that answers from memory, for application-layer tests. */
export class StubTextProvider implements TextGenerationProvider {
  calls = 0;

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
}

/** Speech provider that answers from memory, for application-layer tests. */
export class StubTtsProvider implements TextToSpeechProvider {
  calls = 0;

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
}
