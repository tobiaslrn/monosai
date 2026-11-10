import { expect, test, type Page } from '@playwright/test';
import { connectAnki, openVocabulary, refuseAnkiConnect, stubAnkiConnect } from './anki';
import { openGenerate, prepareGeneration } from './generation';
import { importReading } from './reading';
import { expectMotionSettled } from './sheets';
import { GENERATION_READY_STATE, TTS_READY_STATE } from './state';

/**
 * Text that is large or the screen narrow must stay whole: nothing cut off,
 * outside the screen, hidden behind a bar, or broken in the middle of a word.
 *
 * Large text is simulated by scaling the root font size, as the text-size
 * preference does; it is not a real Android setting. The page itself never
 * scrolls sideways when a card clips its contents, so this measures the text
 * itself, line by line, against the screen and every box that holds it.
 */
const SCREENS = [
  { width: 320, zoom: 200 },
  { width: 320, zoom: 100 },
  { width: 393, zoom: 150 },
] as const;

/** Applies the screen before the first paint and returns once it holds. */
async function useScreen(page: Page, width: number, zoom: number): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript((percent) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${String(percent)}% !important; }`;
      document.head.append(style);
    });
  }, zoom);
}

/** Names every piece of text that is cut off, outside the screen, or split inside a word. */
async function brokenText(page: Page, zoom: number): Promise<string[]> {
  // A closed disclosure hides its content, which would then go unmeasured.
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) details.open = true;
  });
  await page.evaluate(() => document.fonts.ready);
  // A fold opens its height and a step slides in: measure where they rest.
  await expectMotionSettled(page);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      }),
  );
  return page.evaluate((percent) => {
    const problems = new Set<string>();
    const canvas = document.createElement('canvas').getContext('2d');
    const label = (el: Element, text = el.textContent): string =>
      `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0] ?? ''} "${text.trim().slice(0, 28)}"`;
    const clips = (style: CSSStyleDeclaration): boolean =>
      ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);

    const roots = [document.querySelector('header'), document.querySelector('main')];
    const nodes: Text[] = [];
    for (const root of roots) {
      if (root === null) continue;
      const each = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = each.nextNode(); node !== null; node = each.nextNode()) {
        nodes.push(node as Text);
      }
    }

    for (const node of nodes) {
      const text = node.data;
      const host = node.parentElement;
      if (host === null || text.trim() === '') continue;
      if (host.closest('svg, .mn-visually-hidden, script, style, [hidden]') !== null) continue;
      if (!host.checkVisibility()) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      if (rects.length === 0) continue;
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      const where = label(host, text);

      // Deliberate: a model name or value ends in an ellipsis at normal text size.
      const ellipsised = percent === 100 && getComputedStyle(host).textOverflow === 'ellipsis';
      // Deliberate: a long name wraps for two lines and then ends.
      const title = host.closest('.mn-list-row__title');
      const clamped = title !== null && getComputedStyle(title).webkitLineClamp === '2';

      if (right > innerWidth + 1 || left < -1) {
        problems.add(`outside the screen: ${where}`);
      }

      for (let up: Element | null = host; up !== null; up = up.parentElement) {
        if (up === document.documentElement || up === document.body) break;
        const style = getComputedStyle(up);
        const bounds = up.getBoundingClientRect();
        if (clips(style) && !ellipsised) {
          if (right > bounds.right + 1 || left < bounds.left - 1) {
            problems.add(`cut off sideways by ${label(up)}: ${where}`);
          }
          if (!clamped && (bottom > bounds.bottom + 1 || top < bounds.top - 1)) {
            problems.add(`cut off vertically by ${label(up)}: ${where}`);
          }
          if (!clamped && up.scrollHeight > up.clientHeight + 1 && style.overflowY !== 'visible') {
            problems.add(`taller than ${label(up)}: ${where}`);
          }
        }
        if (
          !ellipsised &&
          up.matches('.mn-card, .mn-list-row, .mn-section__card, mn-card, mn-row') &&
          (right > bounds.right + 1 || left < bounds.left - 1)
        ) {
          problems.add(`sticks out of ${label(up)}: ${where}`);
        }
      }

      // A word is never broken to make it fit; only a real long token may be.
      for (const match of text.matchAll(/[A-Za-z]{4,}/g)) {
        const start = match.index;
        const word = document.createRange();
        word.setStart(node, start);
        word.setEnd(node, start + match[0].length);
        const lines = new Set([...word.getClientRects()].map((rect) => Math.round(rect.top)));
        if (lines.size > 1 && match[0].length <= 12) {
          problems.add(`word split across lines: ${match[0]} in ${where}`);
        }
      }
    }

    for (const select of document.querySelectorAll('select')) {
      if (!select.checkVisibility() || canvas === null) continue;
      const style = getComputedStyle(select);
      canvas.font = style.font;
      const shown = select.selectedOptions[0]?.textContent ?? '';
      const room =
        select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (canvas.measureText(shown).width > room) {
        problems.add(`value cut off: ${label(select, shown)}`);
      }
    }
    return [...problems];
  }, zoom);
}

/** Reports controls a bar covers once the page is scrolled to its end. */
async function coveredControls(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  return page.evaluate(() =>
    [...document.querySelectorAll('main button, main a, main select, main input, main summary')]
      .filter((el) => {
        if (!el.checkVisibility()) return false;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.bottom < 0 || box.top > innerHeight) {
          return false;
        }
        const top = document.elementFromPoint(
          box.left + box.width / 2,
          Math.min(box.top + box.height / 2, innerHeight - 1),
        );
        // The top bar sticks over whatever has scrolled under it, which is not a loss.
        return (
          top !== null && top.closest('header') === null && !el.contains(top) && !top.contains(el)
        );
      })
      .map((el) => `covered: ${el.textContent.trim().slice(0, 28)}`),
  );
}

async function expectWhole(page: Page, zoom: number): Promise<void> {
  expect(await brokenText(page, zoom)).toEqual([]);
  expect(await coveredControls(page)).toEqual([]);
}

const LONG_TITLE = 'これは長い題名の物語です'.repeat(4);

for (const { width, zoom } of SCREENS) {
  test.describe(`at ${String(width)}px with ${String(zoom)}% text`, () => {
    test.beforeEach(async ({ page }) => {
      await useScreen(page, width, zoom);
    });

    test.describe('with a text and voice model', () => {
      test.use({ storageState: TTS_READY_STATE });

      test('keeps Settings whole @smoke @mobile', async ({ page }) => {
        await page.goto('./#/settings');
        await expect(page.getByText('Technical details')).toBeVisible();
        await expect(page.getByTestId('api-key-input')).toHaveCount(0);
        // Large text makes the top bar tall; focus must scroll clear of it.
        const padding = await page.evaluate(() => ({
          root: parseFloat(document.documentElement.style.scrollPaddingTop || '0'),
          bar: document.querySelector('header')?.getBoundingClientRect().height ?? 0,
        }));
        if (zoom > 100) {
          expect(padding.root).toBeCloseTo(padding.bar, 0);
        } else {
          expect(padding.root).toBe(0);
        }
        await expectWhole(page, zoom);
      });
    });

    test.describe('with a way to write', () => {
      test.use({ storageState: GENERATION_READY_STATE });

      test('keeps the words step of Generate whole @smoke @mobile', async ({ page }) => {
        await prepareGeneration(page, { generation: {} });
        await openGenerate(page);
        await expect(page.getByTestId('wizard-next')).toBeVisible();
        await expect(page.getByTestId('strictness-value')).toBeVisible();
        await expectWhole(page, zoom);
      });

      test('keeps the direction step of Generate whole @smoke @mobile', async ({ page }) => {
        await prepareGeneration(page, { generation: {} });
        await openGenerate(page);
        await page.getByTestId('wizard-next').click();
        await expect(page.getByRole('heading', { name: 'Direction', level: 2 })).toBeVisible();
        await expect(page.getByTestId('axis-value').first()).toBeVisible();
        await expectWhole(page, zoom);
      });
    });

    test('keeps Generate without a model whole @smoke @mobile', async ({ page }) => {
      await page.goto('./#/generate');
      await expect(page.getByRole('heading', { name: 'Write with AI', level: 1 })).toBeVisible();
      await expect(page.getByTestId('strictness-value')).toBeVisible();
      await expectWhole(page, zoom);
    });

    test('keeps What you can read whole @smoke @mobile', async ({ page }) => {
      await openVocabulary(page);
      await expect(page.getByTestId('reading-level-link')).toBeVisible();
      await expect(page.getByTestId('grammar-standing')).toBeVisible();
      await expectWhole(page, zoom);
    });

    test('keeps Help whole @smoke @mobile', async ({ page }) => {
      await page.goto('./#/help');
      await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
      await expect(page.locator('main a').nth(3)).toBeVisible();
      await expectWhole(page, zoom);
    });

    test('keeps a Library with a long story title whole @smoke @mobile', async ({ page }) => {
      await importReading(page, 'これは長い題名の物語です。'.repeat(8), LONG_TITLE);
      await page.goto('./#/library');
      await expect(page.getByText(LONG_TITLE.slice(0, 12)).first()).toBeVisible();
      await expectWhole(page, zoom);
    });

    test('keeps an Anki source that could not be read whole @smoke', async ({ page }) => {
      test.setTimeout(120_000);
      await stubAnkiConnect(page, {
        version: 6,
        requestPermission: { permission: 'granted', requireApiKey: false, version: 6 },
        deckNames: ['Core Japanese'],
        modelNames: ['Basic'],
        modelFieldNames: ['Expression', 'Meaning'],
        findCards: [1],
        cardsInfo: [{ cardId: 1, note: 10, reps: 2, queue: 2, deckName: 'Core Japanese' }],
        notesInfo: [
          {
            noteId: 10,
            modelName: 'Basic',
            fields: {
              Expression: { value: 'ねこ', order: 0 },
              Meaning: { value: 'cat', order: 1 },
            },
          },
        ],
      });
      await openVocabulary(page);
      await connectAnki(page);
      await page.getByRole('button', { name: 'Confirm vocabulary', exact: true }).click();
      await expect(page.getByTestId('words-standing')).toHaveText('1 word', { timeout: 60_000 });
      await page.getByTestId('source-row').filter({ hasText: 'Anki' }).click();
      await page.unrouteAll({ behavior: 'wait' });
      await refuseAnkiConnect(page);
      await page.getByTestId('sync-now').click();
      await expect(page.getByTestId('source-attention')).toBeVisible({ timeout: 60_000 });
      await page.goBack();
      await expect(page.getByTestId('attention-retry')).toBeVisible();
      await expectWhole(page, zoom);
    });
  });
}
