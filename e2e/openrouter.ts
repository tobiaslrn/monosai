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
  /** Sentence targets carried by each translation request, in request order. */
  readonly translations: readonly (readonly { id: string; textJa: string }[])[];
  /**
   * The most synthesis requests that were ever open at the same moment.
   *
   * Recorded by the route rather than counted from `urls`, because a bound on
   * concurrency is a claim about overlap and a list of URLs cannot say whether
   * two of them overlapped.
   */
  readonly audio: { peakConcurrency: number };
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
  /**
   * How long each grammar or translation reply is held before it is fulfilled.
   *
   * The preparation lane starts the moment a generated story is saved, so
   * against an instant stub the aids can land before a test has looked at the
   * library at all. A small delay makes "the story is there before its aids
   * are" a state the test can actually observe.
   */
  readonly aidDelayMs?: number;
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
   * How a request for one particular sentence answers, overriding both of the
   * above when it returns an outcome.
   *
   * A sentence that fails *permanently* is not a position in a sequence: the
   * run carries on past it and every later attempt asks for it again, so the
   * refusal has to follow the sentence rather than the request number.
   */
  readonly audioByText?: (text: string) => AudioOutcome | null;
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
const STORY_REPAIR_SCHEMA = 'monosai_story_repair_patch';
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
  // Enrichment prompts carry their targets as JSON inside a data block. Keep
  // the parser tolerant of the old line-oriented representation as well: the
  // route is shared by tests that exercise prompt compatibility and by the
  // current production prompt contract.
  const dataBlock =
    /<<<MONOSAI_DATA\s+(?:reading window|translation targets|sentences in reading order)\n([\s\S]*?)\nMONOSAI_DATA>>>/.exec(
      text,
    );
  if (dataBlock?.[1] !== undefined) {
    try {
      const parsed: unknown = JSON.parse(dataBlock[1]);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((value) => {
          if (
            typeof value !== 'object' ||
            value === null ||
            typeof (value as { id?: unknown }).id !== 'string' ||
            typeof (value as { textJa?: unknown }).textJa !== 'string'
          ) {
            return [];
          }
          const sentence = value as { id: string; textJa: string };
          return [{ id: sentence.id, textJa: sentence.textJa }];
        });
      }
    } catch {
      // Fall through to the legacy parser so a malformed test prompt remains
      // observable as an empty request rather than breaking the route itself.
    }
  }

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

/**
 * The ids a translation request actually asks about.
 *
 * The window carries context entries too, and answering for one of those is an
 * extra translation that rejects the whole batch — the same way a real model's
 * would.
 */
function requestedTargetIds(text: string): readonly string[] | null {
  const block = /<<<MONOSAI_CONFIG\s+translation requirements\n([\s\S]*?)\nMONOSAI_CONFIG>>>/.exec(
    text,
  );
  if (block?.[1] === undefined) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(block[1]);
    const ids = (parsed as { targetIds?: unknown }).targetIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * The indexes a scoped repair must answer for, and the title when it is one.
 *
 * A repair that only has to replace words no longer returns a whole story, so
 * the stub answers the patch shape the adapter splices in.
 */
function repairTargets(text: string): { indexes: readonly number[]; title: boolean } {
  const block = /<<<MONOSAI_CONFIG\s+repair requirements\n([\s\S]*?)\nMONOSAI_CONFIG>>>/.exec(text);
  if (block?.[1] === undefined) {
    return { indexes: [], title: false };
  }
  try {
    const parsed = JSON.parse(block[1]) as { targetIndexes?: unknown; titleIndex?: unknown };
    const titleIndex = typeof parsed.titleIndex === 'number' ? parsed.titleIndex : -1;
    const raw = Array.isArray(parsed.targetIndexes) ? parsed.targetIndexes : [];
    const indexes = raw.filter((index): index is number => typeof index === 'number');
    return {
      indexes: indexes.filter((index) => index !== titleIndex),
      title: indexes.includes(titleIndex),
    };
  } catch {
    return { indexes: [], title: false };
  }
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

/**
 * The models the stubbed catalogue offers.
 *
 * The settings pickers choose from this list rather than from a typed model
 * ID, so every model a test wants to pick has to exist here.
 */
const CATALOGUE = [
  'vendor/text-model',
  'vendor/grammar-model',
  'vendor/translator',
  'vendor/tts-model',
  'vendor/second-tts-model',
];

function isSpeechModel(modelId: string): boolean {
  return modelId.includes('tts');
}

/** One model as OpenRouter describes it on the wire. */
function modelPayload(modelId: string): Record<string, unknown> {
  const tts = isSpeechModel(modelId);
  return {
    id: modelId,
    name: `Test ${modelId.slice(modelId.indexOf('/') + 1)}`,
    canonical_slug: modelId,
    context_length: 32_768,
    created: 0,
    default_parameters: null,
    architecture: {
      modality: tts ? 'text->audio' : 'text->text',
      input_modalities: ['text'],
      output_modalities: [tts ? 'audio' : 'text'],
    },
    // A speech entry declares both optional channels, the shape an
    // OpenAI-compatible TTS model has, so the lane exercises the declared path
    // rather than the "nothing to try" one.
    supported_parameters: tts
      ? ['response_format', 'speed', 'instructions']
      : ['reasoning', 'structured_outputs'],
    supported_voices: tts ? ['sakura', 'Kore'] : [],
    links: { details: `https://openrouter.ai/${modelId}` },
    per_request_limits: null,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { is_moderated: false },
  };
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
  const translationRequests: { id: string; textJa: string }[][] = [];
  const served = { story: 0, repair: 0, decisions: 0, grammar: 0, translations: 0 };
  let audioRequests = 0;
  let inFlightAudio = 0;
  const calls: ProviderCalls = {
    urls,
    translations: translationRequests,
    audio: { peakConcurrency: 0 },
  };

  await page.route(OPENROUTER_PATTERN, async (route) => {
    const url = route.request().url();
    urls.push(url);

    // The settings pickers browse the catalogue, so the list is served before
    // the single-model lookup and filtered by the modality that was asked for:
    // a speech picker that offered a text model would make "an incompatible
    // model cannot be chosen" untestable.
    if (url.includes('/api/v1/models')) {
      const speech = /speech|audio/.test(url);
      const data = CATALOGUE.filter((modelId) => isSpeechModel(modelId) === speech).map(
        modelPayload,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // The listing is paginated on the wire, and the SDK refuses a page that
        // does not say where it ends: one page, and there is no next.
        body: JSON.stringify({ data, links: { next: null }, total_count: data.length }),
      });
      return;
    }

    if (url.includes('/audio/speech')) {
      const spoken = (route.request().postDataJSON() as { input?: unknown }).input;
      const forThisSentence =
        typeof spoken === 'string' ? options.audioByText?.(spoken) : undefined;
      const audio = forThisSentence ??
        nextOf(options.audioSequence, audioRequests) ??
        options.audio ?? { kind: 'valid' };
      audioRequests += 1;
      inFlightAudio += 1;
      calls.audio.peakConcurrency = Math.max(calls.audio.peakConcurrency, inFlightAudio);
      try {
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
      } finally {
        inFlightAudio -= 1;
      }
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

    const body = route.request().postDataJSON() as ChatBody;
    const aidDelayMs = isAidRequest(body) ? options.generation?.aidDelayMs : undefined;
    const generated = generationContent(body);
    if (generated !== null && generated !== HANG && aidDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, aidDelayMs));
    }
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

  /** Whether this request is a grammar review or a translation batch. */
  function isAidRequest(body: ChatBody): boolean {
    const schema = body.response_format?.json_schema?.name;
    return schema === GRAMMAR_SCHEMA || schema === TRANSLATIONS_SCHEMA;
  }

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
    if (
      schema === GRAMMAR_SCHEMA ||
      text.includes('review each given Japanese sentence') ||
      text.includes('sentences in reading order')
    ) {
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
    if (
      schema === TRANSLATIONS_SCHEMA ||
      text.includes('translate each given Japanese sentence') ||
      text.includes('reading window')
    ) {
      const outcome = nextOf(options.generation?.translations, served.translations) ?? 'ok';
      served.translations += 1;
      const window = requestedSentences(text);
      const targetIds = requestedTargetIds(text);
      const sentences =
        targetIds === null ? window : window.filter((sentence) => targetIds.includes(sentence.id));
      translationRequests.push(sentences.map((sentence) => ({ ...sentence })));
      if (outcome === 'hang') {
        return HANG;
      }
      if (outcome === 'unavailable') {
        return 'Sure, happy to help!';
      }
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
    if (schema === STORY_REPAIR_SCHEMA || text.includes('story window in reading order')) {
      const reply = nextOf(options.generation?.repairs, served.repair);
      served.repair += 1;
      if (reply === undefined) {
        return null;
      }
      const targets = repairTargets(text);
      return JSON.stringify({
        titleJa: targets.title ? reply.titleJa : null,
        replacements: targets.indexes.map((index) => ({
          index,
          textJa: reply.sentences.at(index) ?? reply.sentences[0],
        })),
      });
    }
    if (schema !== STORY_SCHEMA && !text.includes('vocabulary inventory')) {
      return null;
    }
    if (text.includes('repair requirements')) {
      const reply = nextOf(options.generation?.repairs, served.repair);
      served.repair += 1;
      return reply === undefined ? null : storyPayload(reply);
    }
    const reply = nextOf(options.generation?.stories, served.story);
    served.story += 1;
    return reply === undefined ? null : storyPayload(reply);
  }

  return calls;
}

/**
 * The node of one job in the settings tree.
 *
 * Readiness is asserted through the node's `data-readiness` attribute rather
 * than its wording, because the visible status doubles as the retry control
 * and a text match cannot tell a state from an invitation to act on it.
 */
export function textModelReadiness(page: Page): Locator {
  return page.locator('[data-capability="text"]');
}

export function ttsReadiness(page: Page): Locator {
  return page.locator('[data-capability="audio"]');
}

export function taskReadiness(page: Page, task: 'translation' | 'grammar'): Locator {
  return page.locator(`[data-capability="${task}"]`);
}

export async function expectReadiness(locator: Locator, readiness: string): Promise<void> {
  await expect(locator).toHaveAttribute('data-readiness', readiness);
}

/** Saves a key through the connection menu, which is the only way one can be stored. */
export async function saveApiKey(page: Page, key = 'e2e-placeholder-key'): Promise<void> {
  await page.getByTestId('connect-openrouter').click();
  await page.getByTestId('api-key-input').fill(key);
  await page.getByTestId('save-key').click();
  await expect(page.getByTestId('connect-openrouter')).toContainText('OpenRouter connected');
}

/** Opens one picker and chooses a model from the catalogue it lists. */
async function chooseModel(page: Page, picker: string, modelId: string): Promise<void> {
  await page.getByTestId(picker).click();
  await page.getByTestId(`model-option-${modelId}`).click();
}

/**
 * Chooses the text model.
 *
 * Choosing is all a learner does: the compatibility test runs on selection, so
 * the caller asserts readiness rather than pressing anything. The click returns
 * before the choice is stored, so the helper waits for the node to stop saying
 * it has no model; without that a following edit races the write.
 */
export async function addTextModel(page: Page, modelId: string): Promise<void> {
  await chooseModel(page, 'text-model-picker', modelId);
  await expect(textModelReadiness(page)).not.toHaveAttribute('data-readiness', 'not-configured');
}

/** Opens the translation and grammar branches of the text node. */
export async function openTaskModels(page: Page): Promise<void> {
  const toggle = page.getByTestId('task-models-toggle');
  if (!(await page.getByTestId('translation-model-picker').isVisible())) {
    await toggle.click();
  }
  await expect(page.getByTestId('translation-model-picker')).toBeVisible();
}

/** Routes one task to its own model, which also tests it. */
export async function addTaskModel(
  page: Page,
  task: 'translation' | 'grammar',
  modelId: string,
): Promise<void> {
  await openTaskModels(page);
  await chooseModel(page, `${task}-model-picker`, modelId);
  // The branch keeps showing the inherited model until the route is stored.
  await expect(taskReadiness(page, task)).not.toHaveAttribute('data-readiness', 'inherited');
}

/** Chooses the speech model and voice. The preview is what tests them. */
export async function addTtsModel(page: Page, modelId: string, voiceId = 'sakura'): Promise<void> {
  await chooseModel(page, 'audio-model-picker', modelId);
  // The voice field is a free-text box until the chosen model's own voices are
  // known, so the list has to be waited for rather than typed over.
  const voice = page.getByRole('combobox', { name: 'Voice' });
  await expect(voice).toBeVisible();
  await voice.selectOption(voiceId);
}
