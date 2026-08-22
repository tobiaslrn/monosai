import { expect, type Locator, type Page, type Route } from '@playwright/test';

/**
 * Routes every OpenRouter call to a controllable stand-in.
 *
 * The real service is never contacted from the suite, and the route also
 * records what was sent, which is how "no request happens unless the learner
 * asks for one" is asserted rather than assumed.
 */

export const OPENROUTER_PATTERN = 'https://openrouter.ai/**';

export type ChatOutcome =
  | { kind: 'valid' }
  | { kind: 'prose' }
  | { kind: 'status'; status: number; message?: string }
  | { kind: 'hang' };

export type AudioOutcome =
  { kind: 'valid' } | { kind: 'wrong-mime' } | { kind: 'status'; status: number; message?: string };

export interface ProviderCalls {
  readonly urls: string[];
}

/**
 * Replies for the generation tasks, in the order they are requested.
 *
 * The stub decides which queue a request belongs to from the structured-output
 * schema name it carries, so one route serves the compatibility probe, the
 * story, the repair, and the exception review without the test having to count
 * requests. A queue that runs out repeats its last entry.
 */
export interface GenerationStubs {
  readonly stories?: readonly StoryReply[];
  readonly repairs?: readonly StoryReply[];
  readonly decisions?: readonly ExceptionReply[];
  /**
   * How each grammar review answers, in order. `unavailable` returns prose,
   * which is what an unusable review looks like on the wire once the adapter
   * has spent its one format recovery. `finding` returns one span finding for
   * keyboard/disclosure coverage in the reader.
   */
  readonly grammar?: readonly AuxiliaryOutcome[];
  /** How each translation batch answers, in order. */
  readonly translations?: readonly AuxiliaryOutcome[];
}

/**
 * One auxiliary answer.
 *
 * `ok` echoes back exactly what was asked for, which is what makes a batch
 * count assertion meaningful; `unavailable` is unusable content, and `partial`
 * drops the last requested entry so the batch fails completeness validation.
 */
export type AuxiliaryOutcome = 'ok' | 'unavailable' | 'partial' | 'hang' | 'finding';

/** Returned instead of content when this request must stay in flight. */
const HANG = Symbol('hang');

export interface StoryReply {
  readonly titleJa: string;
  readonly sentences: readonly string[];
}

export interface ExceptionReply {
  readonly candidateId: string;
  readonly decision: 'approved' | 'rejected';
  readonly explanationEn: string;
}

export interface StubOptions {
  readonly chat?: ChatOutcome;
  readonly audio?: AudioOutcome;
  /**
   * How each synthesis request answers, in order, overriding `audio`.
   *
   * A whole-reading preparation run that fails at sentence N is a sequence, not
   * a single outcome: the run has to succeed N-1 times and then refuse, so that
   * "clips 1..N-1 remain and Retry resumes at N" is testable at all. A sequence
   * that runs out repeats its last entry.
   */
  readonly audioSequence?: readonly AudioOutcome[];
  /**
   * How long each synthesis response is held before it is fulfilled.
   *
   * Preparing a whole reading against an instant stub finishes before a click
   * on Stop can land, which makes "cancelling mid-run keeps the clips already
   * produced" untestable. A small delay makes the middle of a run a place the
   * test can actually be.
   */
  readonly audioDelayMs?: number;
  readonly generation?: GenerationStubs;
}

/**
 * A short run of silent MPEG-1 Layer III frames.
 *
 * It has to be real MP3 rather than arbitrary bytes, because verification
 * decodes what a provider returns before anything stores it: a clip this
 * browser cannot play is refused at the moment it is produced rather than the
 * first time the learner presses play. Constant-length silent frames are the
 * smallest thing that genuinely decodes.
 */
const MP3_FRAME_BYTES = 417;
const MP3_FRAME_COUNT = 24;

function silentMp3(): Buffer {
  const frame = Buffer.alloc(MP3_FRAME_BYTES);
  // MPEG-1 Layer III, no CRC, 128 kbps, 44.1 kHz, joint stereo. The payload is
  // left zeroed, which decodes to silence.
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x64;
  return Buffer.concat(Array.from({ length: MP3_FRAME_COUNT }, () => frame));
}

/** Names of the JSON schemas the generation and enrichment adapters send. */
const STORY_SCHEMA = 'monosai_story';
const DECISIONS_SCHEMA = 'monosai_exception_decisions';
const GRAMMAR_SCHEMA = 'monosai_grammar_review';
const TRANSLATIONS_SCHEMA = 'monosai_translations';

/**
 * The sentence ids a grammar or translation request carries.
 *
 * Both prompts list their sentences as `id: …` / `text: …` pairs, so the stub
 * can answer per requested id without the test having to know which sentences
 * a run accepted.
 */
function requestedSentences(text: string): readonly { id: string; textJa: string }[] {
  const lines = text.split('\n');
  const found: { id: string; textJa: string }[] = [];
  lines.forEach((line, index) => {
    const next = lines[index + 1] as string | undefined;
    if (!line.startsWith('id: ') || next?.startsWith('text: ') !== true) {
      return;
    }
    found.push({ id: line.slice('id: '.length).trim(), textJa: next.slice('text: '.length) });
  });
  return found;
}

interface ChatBody {
  readonly messages?: readonly { readonly role: string; readonly content: string }[];
  readonly response_format?: { readonly json_schema?: { readonly name?: string } };
}

function storyPayload(reply: StoryReply): string {
  return JSON.stringify({
    titleJa: reply.titleJa,
    sentences: reply.sentences.map((textJa, index) => ({ index, textJa })),
  });
}

function nextOf<T>(queue: readonly T[] | undefined, index: number): T | undefined {
  if (queue === undefined || queue.length === 0) {
    return undefined;
  }
  return queue[Math.min(index, queue.length - 1)];
}

function providerError(route: Route, status: number, message: string): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message, code: status } }),
  });
}

export async function stubOpenRouter(
  page: Page,
  options: StubOptions = {},
): Promise<ProviderCalls> {
  const urls: string[] = [];
  const served = { story: 0, repair: 0, decisions: 0, grammar: 0, translations: 0 };
  let audioRequests = 0;

  await page.route(OPENROUTER_PATTERN, async (route) => {
    const url = route.request().url();
    urls.push(url);

    if (url.includes('/api/v1/model/')) {
      const marker = '/api/v1/model/';
      const modelId = decodeURIComponent(url.slice(url.indexOf(marker) + marker.length));
      const tts = modelId.includes('tts');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: modelId,
            name: tts ? 'Test voice model' : 'Test text model',
            canonical_slug: modelId,
            context_length: 32_768,
            created: 0,
            default_parameters: null,
            architecture: {
              modality: tts ? 'text->audio' : 'text->text',
              input_modalities: ['text'],
              output_modalities: [tts ? 'audio' : 'text'],
            },
            supported_parameters: tts ? ['response_format'] : ['reasoning', 'structured_outputs'],
            supported_voices: tts ? ['sakura', 'Kore'] : [],
            links: { details: `https://openrouter.ai/${modelId}` },
            per_request_limits: null,
            pricing: { prompt: '0', completion: '0' },
            top_provider: { is_moderated: false },
          },
        }),
      });
      return;
    }

    if (url.includes('/audio/speech')) {
      const audio = nextOf(options.audioSequence, audioRequests) ??
        options.audio ?? { kind: 'valid' };
      audioRequests += 1;
      if (options.audioDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.audioDelayMs));
      }
      if (audio.kind === 'status') {
        await providerError(route, audio.status, audio.message ?? 'Refused');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: audio.kind === 'wrong-mime' ? 'application/json' : 'audio/mpeg',
        body: audio.kind === 'wrong-mime' ? Buffer.alloc(2048, 1) : silentMp3(),
      });
      return;
    }

    const chat = options.chat ?? { kind: 'valid' };
    if (chat.kind === 'status') {
      await providerError(route, chat.status, chat.message ?? 'Refused');
      return;
    }
    if (chat.kind === 'hang') {
      // Never fulfilled: the request stays in flight so cancellation is real.
      await new Promise(() => undefined);
      return;
    }

    const generated = generationContent(route.request().postDataJSON() as ChatBody);
    if (generated === HANG) {
      // Never fulfilled, so cancelling this one stage is real while the stages
      // before it answered normally.
      await new Promise(() => undefined);
      return;
    }
    if (generated !== null) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: generated } }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                chat.kind === 'prose' ? 'Sure, happy to help!' : '{"ok": true, "language": "ja"}',
            },
          },
        ],
      }),
    });
  });

  /**
   * The reply for a generation task, or `null` when this is not one.
   *
   * A repair is told apart from a first draft by the marker the repair prompt
   * carries, which is the only difference the two requests have on the wire.
   */
  function generationContent(body: ChatBody): string | typeof HANG | null {
    const schema = body.response_format?.json_schema?.name;
    const text = (body.messages ?? []).map((message) => message.content).join(' ');

    // Matched on the task instruction, not on the guidance block: the story and
    // repair prompts carry the same grammar guidance and must not be answered
    // with a review.
    if (schema === GRAMMAR_SCHEMA || text.includes('review each given Japanese sentence')) {
      const outcome = nextOf(options.generation?.grammar, served.grammar) ?? 'ok';
      served.grammar += 1;
      if (outcome === 'hang') {
        return HANG;
      }
      if (outcome === 'finding') {
        const first = requestedSentences(text).at(0);
        return JSON.stringify({
          findings:
            first === undefined
              ? []
              : [
                  {
                    sentenceId: first.id,
                    label: 'te-form',
                    explanationEn: 'Joins this clause to the next one.',
                    confidence: 'high',
                    inProfile: false,
                    startUtf16: 0,
                    endUtf16: 1,
                  },
                ],
        });
      }
      // A review with no findings is a complete review, not a missing one.
      return outcome === 'unavailable' ? 'Sure, happy to help!' : JSON.stringify({ findings: [] });
    }
    if (schema === TRANSLATIONS_SCHEMA || text.includes('translate each given Japanese sentence')) {
      const outcome = nextOf(options.generation?.translations, served.translations) ?? 'ok';
      served.translations += 1;
      if (outcome === 'hang') {
        return HANG;
      }
      if (outcome === 'unavailable') {
        return 'Sure, happy to help!';
      }
      const sentences = requestedSentences(text);
      const answered = outcome === 'partial' ? sentences.slice(0, -1) : sentences;
      return JSON.stringify({
        translations: answered.map((sentence) => ({
          id: sentence.id,
          textEn: `EN: ${sentence.textJa}`,
        })),
      });
    }
    if (schema === DECISIONS_SCHEMA || text.includes('exception policy (data)')) {
      const reply = nextOf(options.generation?.decisions, served.decisions);
      served.decisions += 1;
      return JSON.stringify({ decisions: reply === undefined ? [] : [reply] });
    }
    if (schema !== STORY_SCHEMA && !text.includes('allowed vocabulary (data)')) {
      return null;
    }
    if (text.includes('Repair attempt')) {
      const reply = nextOf(options.generation?.repairs, served.repair);
      served.repair += 1;
      return reply === undefined ? null : storyPayload(reply);
    }
    const reply = nextOf(options.generation?.stories, served.story);
    served.story += 1;
    return reply === undefined ? null : storyPayload(reply);
  }

  return { urls };
}

/**
 * The readiness badge of one section.
 *
 * Asserted through its `data-readiness` attribute rather than its wording,
 * because the surrounding hints legitimately talk about tests being out of
 * date and a text match cannot tell the two apart.
 */
export function textModelReadiness(page: Page): Locator {
  return page.getByRole('region', { name: 'AI text features' }).locator('[data-readiness]');
}

export function ttsReadiness(page: Page): Locator {
  return page.getByRole('region', { name: 'Voice (optional)' }).locator('[data-readiness]');
}

export async function expectReadiness(locator: Locator, readiness: string): Promise<void> {
  await expect(locator).toHaveAttribute('data-readiness', readiness);
}

/** Saves a key through the UI, which is the only way one can be stored. */
export async function saveApiKey(page: Page, key = 'e2e-placeholder-key'): Promise<void> {
  await page.getByTestId('api-key-input').fill(key);
  await page.getByTestId('save-key').click();
  await expect(page.getByTestId('credential-state')).toContainText('Key saved');
}

/** Registers a text-model preset through the same discovery dialog learners use. */
export async function addTextModel(page: Page, modelId: string): Promise<void> {
  await page.getByTestId('add-text-model').click();
  await page.getByTestId('add-model-id').fill(modelId);
  await page.getByTestId('dialog-discover-model').click();
  await expect(page.getByText('Preset options')).toBeVisible();
  await page.getByTestId('save-model-preset').click();
  await expect(page.getByTestId('text-preset-select')).toBeVisible();
}

/** Registers a voice-model preset through capability-aware model and voice dropdowns. */
export async function addTtsModel(page: Page, modelId: string, voiceId = 'sakura'): Promise<void> {
  await page.getByTestId('add-tts-model').click();
  await page.getByTestId('add-model-id').fill(modelId);
  await page.getByTestId('dialog-discover-model').click();
  await expect(page.getByText('Preset options')).toBeVisible();
  await page.getByTestId('voice-select').selectOption(voiceId);
  await page.getByTestId('save-model-preset').click();
  await expect(page.getByTestId('tts-preset-select')).toBeVisible();
}
