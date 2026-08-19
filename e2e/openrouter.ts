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
}

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
  readonly generation?: GenerationStubs;
}

/** Names of the JSON schemas the generation adapter sends. */
const STORY_SCHEMA = 'monosai_story';
const DECISIONS_SCHEMA = 'monosai_exception_decisions';

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
  const served = { story: 0, repair: 0, decisions: 0 };

  await page.route(OPENROUTER_PATTERN, async (route) => {
    const url = route.request().url();
    urls.push(url);

    if (url.includes('/audio/speech')) {
      const audio = options.audio ?? { kind: 'valid' };
      if (audio.kind === 'status') {
        await providerError(route, audio.status, audio.message ?? 'Refused');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: audio.kind === 'wrong-mime' ? 'application/json' : 'audio/mpeg',
        body: Buffer.alloc(2048, 1),
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
  function generationContent(body: ChatBody): string | null {
    const schema = body.response_format?.json_schema?.name;
    const text = (body.messages ?? []).map((message) => message.content).join(' ');

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
  return page.getByRole('region', { name: 'OpenRouter text' }).locator('[data-readiness]');
}

export function ttsReadiness(page: Page): Locator {
  return page.getByRole('region', { name: 'Text to speech' }).locator('[data-readiness]');
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
