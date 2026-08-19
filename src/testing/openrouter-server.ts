/**
 * A deterministic stand-in for the OpenRouter API.
 *
 * It answers the two OpenAI-compatible endpoints Monosai uses, with the same
 * status codes, error envelopes, and headers, so the adapters under test run
 * their real request, retry, and parsing paths. Every departure from the happy
 * path is an explicit option rather than a separate hand-written response, so a
 * test names the condition it is exercising.
 */

export type ChatContentKind =
  | 'valid'
  | 'fenced'
  | 'prose'
  | 'invalid-json'
  | 'wrong-shape'
  | 'empty'
  | 'story'
  | 'story-repaired'
  | 'story-duplicate-index'
  | 'story-too-short'
  | 'decisions-approved'
  | 'decisions-rejected';

export type AudioKind = 'valid' | 'empty' | 'wrong-mime' | 'oversized';

export interface FakeOpenRouterOptions {
  /** Keys the server accepts. Anything else is a 401. */
  readonly apiKeys?: readonly string[];
  readonly knownTextModels?: readonly string[];
  readonly knownTtsModels?: readonly string[];
  readonly knownVoices?: readonly string[];
  /** When false, a request carrying `response_format` is refused with a 400. */
  readonly supportsJsonSchema?: boolean;
  /** When false, a request carrying `speed` is refused with a 400. */
  readonly supportsSpeed?: boolean;
  readonly content?: ChatContentKind;
  /** Content for every chat request after the first, so recovery can differ. */
  readonly recoveryContent?: ChatContentKind;
  /**
   * Content per chat request, in order, for multi-step flows.
   *
   * Takes precedence over `content` and `recoveryContent`. Running past the end
   * of the sequence repeats its last entry, so a test only lists the steps it
   * cares about.
   */
  readonly contentSequence?: readonly ChatContentKind[];
  /** Forced status for every request, for statuses with no other trigger. */
  readonly status?: number;
  /** Number of leading attempts that fail with `transientStatus`. */
  readonly transientFailures?: number;
  readonly transientStatus?: number;
  readonly retryAfter?: string;
  /** Throws like a browser reporting a refused or interrupted request. */
  readonly transportFailure?: boolean;
  readonly delayMs?: number;
  readonly audio?: AudioKind;
  /** Overrides the success content type, for wrong-media-type coverage. */
  readonly contentType?: string;
  /** Declares a content length far past the client's limit. */
  readonly oversizedJson?: boolean;
}

export interface RecordedRequest {
  readonly path: string;
  readonly apiKey: string | null;
  readonly body: Record<string, unknown>;
}

const DEFAULT_KEY = 'sk-test-key';
const DEFAULT_TEXT_MODEL = 'vendor/text-model';
const DEFAULT_TTS_MODEL = 'vendor/tts-model';
const DEFAULT_VOICE = 'sakura';

/** Builds a story payload with contiguous indexes, which is the valid shape. */
function story(sentences: readonly string[], titleJa = 'ねこの一日'): string {
  return JSON.stringify({
    titleJa,
    sentences: sentences.map((textJa, index) => ({ index, textJa })),
  });
}

/** Four sentences: the smallest valid Micro story. */
const MICRO_SENTENCES = [
  'ねこがいます。',
  'ねこはねます。',
  'ねこはたべます。',
  'ねこはあるきます。',
];

function decisions(decision: 'approved' | 'rejected'): string {
  return JSON.stringify({
    decisions: [
      {
        candidateId: 'candidate-1',
        decision,
        explanationEn: 'The policy covers place names the learner mentioned in the premise.',
      },
    ],
  });
}

const CHAT_CONTENT: Record<ChatContentKind, string> = {
  valid: '{"ok": true, "language": "ja"}',
  fenced: '```json\n{"ok": true, "language": "ja"}\n```',
  prose: 'Sure! I can do that for you.',
  'invalid-json': '{"ok": true, "language": ',
  'wrong-shape': '{"ok": "yes", "language": "en"}',
  empty: '',
  story: story(MICRO_SENTENCES),
  'story-repaired': story([
    'ねこがいます。',
    'ねこはねます。',
    'ねこはのみます。',
    'ねこはあるきます。',
  ]),
  'story-duplicate-index': JSON.stringify({
    titleJa: 'ねこの一日',
    sentences: [
      { index: 0, textJa: 'ねこがいます。' },
      { index: 1, textJa: 'ねこはねます。' },
      { index: 1, textJa: 'ねこはたべます。' },
      { index: 3, textJa: 'ねこはあるきます。' },
    ],
  }),
  'story-too-short': story(['ねこがいます。', 'ねこはねます。']),
  'decisions-approved': decisions('approved'),
  'decisions-rejected': decisions('rejected'),
};

/** Bytes that stand in for an MP3. Decodability is decided by the fake decoder. */
function mp3Bytes(byteLength: number): ArrayBuffer {
  const buffer = new ArrayBuffer(byteLength);
  new Uint8Array(buffer).set([0x49, 0x44, 0x33, 0x03]);
  return buffer;
}

export class FakeOpenRouterServer {
  readonly requests: RecordedRequest[] = [];

  private attempts = 0;

  constructor(private readonly options: FakeOpenRouterOptions = {}) {}

  /** Requests that reached the endpoint, including retried attempts. */
  get callCount(): number {
    return this.requests.length;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.options.transportFailure === true) {
      throw new TypeError('Failed to fetch');
    }
    // A real fetch rejects as soon as its signal aborts, and both the timeout
    // and the cancellation paths depend on that, so the delay is abortable
    // rather than a plain sleep.
    if (this.options.delayMs !== undefined) {
      await new Promise<void>((resolve, reject) => {
        const signal = init?.signal ?? null;
        const timer = setTimeout(resolve, this.options.delayMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            const reason: unknown = signal.reason;
            reject(reason instanceof Error ? reason : new DOMException('aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    const apiKey = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;
    const body = this.parseBody(init?.body);
    const path = new URL(url).pathname;
    this.requests.push({ path, apiKey, body });
    this.attempts += 1;

    const forced = this.forcedFailure(apiKey);
    if (forced !== null) {
      return forced;
    }
    if (path.endsWith('/audio/speech')) {
      return this.speech(body);
    }
    return this.chat(body);
  };

  private parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
    if (typeof body !== 'string') {
      return {};
    }
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  }

  /** Conditions that answer before the endpoint's own logic runs. */
  private forcedFailure(apiKey: string | null): Response | null {
    const accepted = this.options.apiKeys ?? [DEFAULT_KEY];
    if (apiKey === null || !accepted.includes(apiKey)) {
      return this.providerError(401, 'No auth credentials found');
    }
    const transientFailures = this.options.transientFailures ?? 0;
    if (this.attempts <= transientFailures) {
      const status = this.options.transientStatus ?? 429;
      return this.providerError(
        status,
        status === 429 ? 'Rate limit exceeded' : 'Upstream provider error',
        this.options.retryAfter === undefined ? {} : { 'Retry-After': this.options.retryAfter },
      );
    }
    if (this.options.status !== undefined) {
      return this.providerError(this.options.status, 'Forced failure');
    }
    return null;
  }

  private chat(body: Record<string, unknown>): Response {
    const model = typeof body['model'] === 'string' ? body['model'] : '';
    const known = this.options.knownTextModels ?? [DEFAULT_TEXT_MODEL];
    if (!known.includes(model)) {
      return this.providerError(404, 'No endpoints found for the requested model');
    }
    if (body['response_format'] !== undefined && this.options.supportsJsonSchema === false) {
      return this.providerError(
        400,
        'This model does not support the response_format parameter',
        {},
        'response_format',
      );
    }

    const sequence = this.options.contentSequence;
    const requestIndex = this.chatRequestCount() - 1;
    const isRecovery = requestIndex > 0;
    const kind =
      sequence === undefined
        ? ((isRecovery ? this.options.recoveryContent : undefined) ??
          this.options.content ??
          'valid')
        : (sequence[Math.min(requestIndex, sequence.length - 1)] ?? 'valid');
    const payload = JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: CHAT_CONTENT[kind] } }],
    });

    const headers: Record<string, string> = {
      'Content-Type': this.options.contentType ?? 'application/json',
    };
    if (this.options.oversizedJson === true) {
      headers['Content-Length'] = String(64 * 1024 * 1024);
    }
    return new Response(payload, { status: 200, headers });
  }

  private chatRequestCount(): number {
    return this.requests.filter((request) => request.path.endsWith('/chat/completions')).length;
  }

  private speech(body: Record<string, unknown>): Response {
    const model = typeof body['model'] === 'string' ? body['model'] : '';
    const voice = typeof body['voice'] === 'string' ? body['voice'] : '';
    if (!(this.options.knownTtsModels ?? [DEFAULT_TTS_MODEL]).includes(model)) {
      return this.providerError(404, 'No endpoints found for the requested model');
    }
    if (!(this.options.knownVoices ?? [DEFAULT_VOICE]).includes(voice)) {
      return this.providerError(400, 'Unknown voice for this model', {}, 'voice');
    }
    if (body['speed'] !== undefined && this.options.supportsSpeed === false) {
      return this.providerError(400, 'This model does not support speed', {}, 'speed');
    }

    switch (this.options.audio ?? 'valid') {
      case 'empty':
        return new Response(new ArrayBuffer(0), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      case 'wrong-mime':
        return new Response(mp3Bytes(512), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      case 'oversized':
        return new Response(mp3Bytes(512), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(64 * 1024 * 1024),
          },
        });
      case 'valid':
      default:
        return new Response(mp3Bytes(2048), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        });
    }
  }

  private providerError(
    status: number,
    message: string,
    headers: Record<string, string> = {},
    param?: string,
  ): Response {
    return new Response(
      JSON.stringify({
        error: { message, code: status, type: 'invalid_request_error', param: param ?? null },
      }),
      { status, headers: { 'Content-Type': 'application/json', ...headers } },
    );
  }
}

export const FAKE_OPENROUTER = {
  apiKey: DEFAULT_KEY,
  textModel: DEFAULT_TEXT_MODEL,
  ttsModel: DEFAULT_TTS_MODEL,
  voice: DEFAULT_VOICE,
} as const;
