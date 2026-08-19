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

export interface StubOptions {
  readonly chat?: ChatOutcome;
  readonly audio?: AudioOutcome;
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
