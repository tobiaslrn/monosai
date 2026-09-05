import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAccessibilityViolations } from './accessibility';
import { expectSettingPersisted } from './storage';
import {
  countOwnedRows,
  importReading,
  openSentence,
  pasteAndContinue,
  saveAndOpenReader,
  tap,
  SAMPLE_TEXT,
} from './reading';

/** What separates two paragraphs in a paste. */
const PARAGRAPH_BREAK = '\n\n';

/**
 * Word details are one floating popover: anchored to the word on a desktop
 * viewport, docked as a sheet on a phone (ADR 0022).
 */
function wordDetails(page: Page) {
  return page.locator('mn-word-inspector');
}

async function openWordDetails(page: Page, surface: string): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(surface) })
    .first()
    .click();
  await expect(wordDetails(page)).toBeVisible();
}

async function setReaderAids(
  page: Page,
  options: { readonly furigana: boolean; readonly spacing: boolean },
): Promise<void> {
  await page.getByRole('button', { name: 'Story options', exact: true }).click();
  const panel = page.getByRole('group', { name: 'Reading appearance' });
  await panel.getByLabel('Text size').fill('2.5');

  for (const [label, checked] of [
    ['Furigana', options.furigana],
    ['Word spacing', options.spacing],
  ] as const) {
    const control = panel.getByRole('checkbox', { name: label });
    if ((await control.isChecked()) !== checked) {
      if (checked) {
        await control.check();
      } else {
        await control.uncheck();
      }
    }
  }

  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      // `resolve` cannot be passed straight to requestAnimationFrame: the
      // callback receives a timestamp, which does not match Promise<void>.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

/**
 * Gives the paragraph just enough room for the second group, but not enough
 * for both groups. The second group must therefore move intact to line two.
 */
async function assertBunsetsuWrap(page: Page, label: string): Promise<void> {
  const paragraph = page.locator('mn-reader-paragraph .paragraph').first();
  await paragraph.evaluate((element) => {
    element.style.removeProperty('width');
    element.style.maxWidth = 'none';
    const groups = [...element.querySelectorAll<HTMLElement>('.bunsetsu-group')];
    if (groups.length < 2) {
      throw new Error(`expected at least two bunsetsu groups, found ${groups.length}`);
    }
    const secondWidth = groups[1].getBoundingClientRect().width;
    const width = Math.ceil(secondWidth + 4);
    element.style.width = `${String(width)}px`;
    element.style.maxWidth = 'none';
    return width;
  });

  const layout = await paragraph.evaluate((element) => {
    const groups = [...element.querySelectorAll<HTMLElement>('.bunsetsu-group')];
    const paragraphRect = element.getBoundingClientRect();
    const groupRects = groups.map((group) => group.getBoundingClientRect());
    const surfaceOf = (group: HTMLElement): string => {
      const copy = group.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('rt, .mn-visually-hidden').forEach((node) => {
        node.remove();
      });
      return copy.textContent.replace(/\s+/g, '');
    };
    const secondTokenTops = [...groups[1].querySelectorAll<HTMLElement>('mn-reader-token')].map(
      (token) => Math.round(token.getBoundingClientRect().top),
    );
    return {
      text: groups.map(surfaceOf),
      tops: groupRects.map((rect) => Math.round(rect.top)),
      secondTokenTops,
      paragraphRight: paragraphRect.right,
      paragraphLeft: paragraphRect.left,
      groupRights: groupRects.map((rect) => rect.right),
      groupLefts: groupRects.map((rect) => rect.left),
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(layout.text, label).toEqual(['名前が', 'あります。']);
  expect(layout.tops[1], label).toBeGreaterThan(layout.tops[0]);
  expect(new Set(layout.secondTokenTops), label).toEqual(new Set([layout.secondTokenTops[0]]));
  expect(layout.groupLefts[1], label).toBeCloseTo(layout.paragraphLeft, 0);
  expect(
    layout.groupRights.every((right) => right <= layout.paragraphRight + 1),
    label,
  ).toBe(true);
  expect(layout.documentOverflow, label).toBeLessThanOrEqual(1);
}

/**
 * End-to-end scenario 1: a fresh install pastes Japanese, saves, and inspects
 * a word — with no Anki, no API key, and no AI request at any point.
 */
test.describe('scenario 1 — paste, save, inspect', () => {
  /**
   * A first visit is the one screen that has to say what Monosai is: it is what
   * a stranger opening the public address sees. Both starting paths are on it,
   * Anki first.
   */
  test('a first visit explains Monosai and needs no setup', async ({ page }) => {
    await page.goto('./');

    await expect(page).toHaveURL(/#\/library/);
    await expect(
      page.getByRole('heading', { name: /Japanese you can actually read/, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText('Everything stays on this device.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Add a word list/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Paste Japanese text/ })).toBeVisible();
  });

  test('New story offers both ways in, and Paste text reaches the reader', async ({ page }) => {
    // New story appears once the shelf has something on it; a first visit
    // offers its two starting paths as cards instead. A different text, because
    // re-importing the same one is not a second reading.
    await importReading(page, '空が青いです。風が気持ちいいです。');
    await page.goto('./#/library');

    await page.getByRole('button', { name: 'New story' }).click();
    const chooser = page.getByRole('dialog', { name: 'New story' });
    await expect(chooser.getByRole('link', { name: 'Paste text' })).toBeVisible();
    await expect(chooser.getByRole('link', { name: 'Write with AI' })).toBeVisible();

    await chooser.getByRole('link', { name: 'Paste text' }).click();
    await expect(page).toHaveURL(/#\/add/);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
  });

  test('paste, save, and read without a review step @mobile @smoke', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);

    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
  });

  test('uses singular wording for a one-sentence paragraph', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, '猫が寝た。');
    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(1);
  });

  test('opens the Settings route from the reader audio setup', async ({ page }) => {
    await importReading(page, '猫が寝た。', 'Audio setup');

    await page.getByRole('button', { name: /^Audio$/ }).click();
    await page.getByRole('link', { name: 'Set up audio model' }).click();

    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('does not leave reader controls on a missing reading', async ({ page }) => {
    // A well-formed id that names nothing: the reading was there and is not
    // any more. A segment that is not a UUID is a different screen (ADR 0042).
    await page.goto('./#/reader/00000000-0000-4000-8000-000000000000');

    await expect(page.getByRole('heading', { name: 'Story unavailable', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Story options', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Audio/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Story options', exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('This story is no longer here');
    await expect(
      page.getByRole('alert').getByRole('link', { name: 'Go to library' }),
    ).toBeVisible();
  });

  test('closes word details when switching to another reading', async ({ page }) => {
    await importReading(page, '学校へ行きます。', 'First reading');
    const firstUrl = page.url();

    await importReading(page, 'これです。', 'Second reading');
    const secondUrl = page.url();

    await page.goto(firstUrl);
    await openWordDetails(page, '学校');
    await expect(wordDetails(page)).toContainText('school');

    await page.goto(secondUrl);
    await expect(page.getByRole('heading', { name: 'Second reading', level: 1 })).toBeVisible();
    await expect(wordDetails(page)).not.toBeAttached();
  });

  test('keeps reader actions reachable and dismisses their menu predictably', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, 'Reader actions');

    const toggle = page.getByRole('button', { name: 'Story options', exact: true });
    const menu = page.getByRole('dialog', { name: 'Story options', exact: true });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(menu).toBeVisible();
    await page.getByRole('heading', { name: 'Reader actions', level: 1 }).click();
    await expect(menu).toBeHidden();

    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('reading text carries Japanese language metadata and whole-token ruby', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.sentence[lang="ja"]').first()).toBeVisible();
    // Ruby is whole-token and only where a reading adds information.
    const ruby = page.locator('ruby', { hasText: '猫' }).first();
    const furigana = ruby.locator('rt');
    await expect(furigana).toHaveText('ねこ');
    const sizes = await ruby.evaluate((element) => ({
      base: Number.parseFloat(getComputedStyle(element).fontSize),
      annotation: Number.parseFloat(getComputedStyle(element.querySelector('rt')!).fontSize),
    }));
    expect(sizes.annotation / sizes.base).toBeGreaterThanOrEqual(0.54);
  });

  test('wraps fitting bunsetsu atomically without horizontal overflow @mobile', async ({
    page,
  }) => {
    await importReading(page, '名前があります。', 'Bunsetsu wrapping');

    await setReaderAids(page, { furigana: true, spacing: true });
    await assertBunsetsuWrap(page, 'furigana and spacing on');

    await setReaderAids(page, { furigana: false, spacing: false });
    await assertBunsetsuWrap(page, 'furigana and spacing off');

    await page.setViewportSize({ width: 320, height: 640 });
    await setReaderAids(page, { furigana: true, spacing: true });
    await assertBunsetsuWrap(page, '320px with furigana and spacing on');

    await setReaderAids(page, { furigana: false, spacing: false });
    await assertBunsetsuWrap(page, '320px with furigana and spacing off');
  });

  test('keeps one main landmark, a sticky header, and no horizontal overflow @mobile @smoke', async ({
    page,
  }) => {
    await importReading(
      page,
      Array.from({ length: 18 }, () => SAMPLE_TEXT).join(PARAGRAPH_BREAK),
      'A long reading with a header that stays available',
    );

    await expect(page.getByRole('main')).toHaveCount(1);
    // The reading has to be laid out before it is tall enough to scroll, and
    // the header is only sticky against a page that actually scrolls.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
      .toBeGreaterThan(500);
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await expect
      .poll(() => page.locator('.bar').evaluate((element) => element.getBoundingClientRect().top))
      .toBeCloseTo(0, 0);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 412, height: 915 },
      { width: 915, height: 412 },
      { width: 360, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(1);
    }
  });

  test('inspecting a word shows local details with no request leaving the origin @smoke', async ({
    page,
    baseURL,
  }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    // Only requests made from here on matter: opening a word must not reach an
    // AI provider, a dictionary service, or anything else off-origin.
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '')) {
        external.push(request.url());
      }
    });

    await openWordDetails(page, '猫');

    await expect(wordDetails(page)).toContainText('猫');
    await expect(wordDetails(page)).toContainText('cat');
    // The compact form summary keeps the dictionary facts visible even when
    // the word is already uninflected, while omitting a useless form line.
    await expect(wordDetails(page).locator('.surface')).toContainText('猫');
    await expect(wordDetails(page).locator('.part-of-speech')).toHaveText('noun');
    await expect(wordDetails(page).locator('.form-line')).toHaveCount(0);
    await expect
      .poll(() =>
        wordDetails(page)
          .locator('.glosses')
          .first()
          .evaluate((element) => getComputedStyle(element).listStyleType),
      )
      .toBe('decimal');
    // The sentence is not repeated here: the learner is looking at it.
    await expect(wordDetails(page)).not.toContainText('In this sentence');
    expect(external).toEqual([]);
  });

  test('hovering a morpheme tints the whole word', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, 'あります。');
    await saveAndOpenReader(page);

    const morpheme = page.getByRole('button', { name: 'ます', exact: true });
    await expect(morpheme).toBeVisible();
    await morpheme.hover();

    const previewed = page.locator('button.is-previewed');
    await expect(previewed).toHaveCount(2);
    await expect(previewed).toHaveText(['あり', 'ます']);
  });

  test('anchors word details beside the word on a desktop viewport', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a phone docks word details as a sheet instead');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();
    await expect(wordDetails(page)).toBeVisible();

    const pane = page.locator('.mn-popover-pane');
    await expect(pane).not.toHaveClass(/is-sheet/);

    const viewport = page.viewportSize();
    const tokenBox = await token.boundingBox();
    const cardBox = await pane.locator('.popover').boundingBox();
    expect(tokenBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(cardBox?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect(cardBox?.width ?? 0).toBeLessThan(viewport?.width ?? 0);

    const gapBelow = (cardBox?.y ?? 0) - ((tokenBox?.y ?? 0) + (tokenBox?.height ?? 0));
    const gapAbove = (tokenBox?.y ?? 0) - ((cardBox?.y ?? 0) + (cardBox?.height ?? 0));
    expect(Math.min(Math.abs(gapBelow), Math.abs(gapAbove))).toBeLessThan(40);
  });

  test('an inflected word is a compact lookup with no derivation controls', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, '僕には分からなかった。昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '分から');
    const details = wordDetails(page);

    await expect(details.locator('.surface .ruby-base')).toHaveText('分');
    await expect(details.locator('.surface rt')).toHaveText('わ');
    await expect(details.locator('.surface')).toContainText('からなかった');
    await expect(details.locator('.dictionary-form')).toHaveText('分かる');
    await expect(details.locator('.part-of-speech')).toHaveText('verb');
    await expect(details.locator('.form-line')).toHaveText('Plain · negative · past');
    await expect(details.locator('.derivation, .step, .detail, .tinted')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('a polite negative past keeps only the high-level form labels', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, '昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '行き');
    const details = wordDetails(page);

    await expect(details.locator('.form-line')).toHaveText('Polite · negative · past');
    await expect(details).not.toContainText('行きませんです');
    await expect(details.locator('.derivation, .step, .detail')).toHaveCount(0);
  });

  test('reaches More from the keyboard and expands all dictionary meanings', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, '昨日は行く。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '行く');
    const details = wordDetails(page);
    const more = details.getByRole('button', { name: /^More/ });

    await expect(more).toBeVisible();
    await more.focus();
    await expect(more).toBeFocused();
    await more.press('Enter');

    await expect(details.locator('.more')).toHaveCount(0);
    await expect(details.locator('.glosses li').first()).toBeVisible();
  });

  test('Escape closes word details and returns focus to its token', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();
    await expect(wordDetails(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(wordDetails(page)).not.toBeAttached();
    await expect(token).toBeFocused();
  });

  test('keyboard reaches sentence actions and every exit restores its token @smoke', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    const openFromKeyboard = async (): Promise<void> => {
      await token.focus();
      await token.press('Enter');
      const route = wordDetails(page).getByRole('button', { name: 'Sentence', exact: true });
      await route.focus();
      await route.press('Enter');
      await expect(page.locator('mn-sentence-popover')).toBeVisible();
    };

    await openFromKeyboard();
    const sentenceDetails = page.getByRole('dialog', { name: 'Sentence details' });
    for (const action of ['Copy', 'Translate', 'Grammar', 'Audio']) {
      await expect(
        sentenceDetails.getByRole('button', { name: action, exact: true }),
      ).toBeVisible();
    }
    await expectNoSeriousAccessibilityViolations(page);

    const copy = page.getByRole('button', { name: 'Copy', exact: true });
    await copy.focus();
    await copy.press('Enter');
    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('mn-sentence-popover')).not.toBeAttached();
    await expect(token).toBeFocused();

    await openFromKeyboard();
    await page.locator('.bar h1').click();
    await expect(page.locator('mn-sentence-popover')).not.toBeAttached();
    await expect(token).toBeFocused();
  });

  test('a pointer-opened sentence returns focus to the sentence on Escape', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const sentence = page.locator('.sentence').first();
    await openSentence(page);
    await page.keyboard.press('Escape');

    await expect(page.locator('mn-sentence-popover')).not.toBeAttached();
    await expect(sentence).toBeFocused();
  });

  test('double-clicking a word leaves one lookup open @smoke', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.dblclick();

    await expect(wordDetails(page)).toBeVisible();
    await expect(page.locator('.mn-popover-pane')).toHaveCount(1);
    await expect(wordDetails(page).locator('.surface .ruby-base')).toHaveText('猫');
    await expect(wordDetails(page).locator('.surface rt')).toHaveText('ねこ');
    await expect(wordDetails(page).locator('.surface')).toContainText('である');
  });

  test('sentence details clear their context and stay in the viewport @mobile', async ({
    page,
    isMobile,
  }) => {
    // Long enough that the subject sentence sits below the fold, so the card
    // has to be placed above it rather than below.
    const text = Array.from({ length: 14 }, (_, index) => `第${String(index + 1)}文を読む。`).join(
      '\n\n',
    );
    await page.goto('./#/add');
    await pasteAndContinue(page, text);
    await saveAndOpenReader(page);

    const paragraphPosition = isMobile ? 0 : 8;
    // Held by document position rather than by an nth index: the reader mounts
    // a moving window of paragraphs, so an index names a different sentence
    // before and after a scroll, and this test is about one particular
    // sentence.
    const sentence = page.locator(`[data-paragraph-position="${String(paragraphPosition)}"]`);
    if (isMobile) {
      await openSentence(page, paragraphPosition);
    } else {
      // The subject starts outside the mounted window, so scroll towards it
      // until the reader has mounted that part of the reading.
      await expect
        .poll(async () => {
          if ((await sentence.count()) > 0) {
            return true;
          }
          await page.evaluate(() => {
            window.scrollBy({ top: window.innerHeight / 2 });
          });
          return false;
        })
        .toBe(true);
      // Corrected until it settles rather than scrolled once: mounting more of
      // the reading moves everything below it, so a single scroll computed
      // before the window grew leaves the sentence somewhere else entirely.
      await expect
        .poll(() =>
          sentence.evaluate((element) => {
            const target = window.innerHeight * 0.4;
            const top = element.getBoundingClientRect().top;
            if (Math.abs(top - target) > 2) {
              window.scrollBy({ top: top - target });
              return false;
            }
            return true;
          }),
        )
        .toBe(true);
      await sentence.locator('.token.is-plain').first().click();
      await expect(page.locator('mn-sentence-popover')).toBeVisible();
    }

    const subjectId = await sentence.locator('.sentence').first().getAttribute('data-sentence-id');

    if (isMobile) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve();
              });
            });
          }),
      );
    }
    const placement = await page.evaluate((id) => {
      const card = document
        .querySelector<HTMLElement>('.mn-popover-pane [role="dialog"]')!
        .getBoundingClientRect();
      const box = document
        .querySelector<HTMLElement>(`[data-sentence-id="${id}"]`)!
        .getBoundingClientRect();
      return {
        card: { top: card.top, right: card.right, bottom: card.bottom, left: card.left },
        subject: { top: box.top, bottom: box.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    }, String(subjectId));
    expect(placement.card.left).toBeGreaterThanOrEqual(0);
    expect(placement.card.right).toBeLessThanOrEqual(placement.viewport.width);
    expect(placement.card.top).toBeGreaterThanOrEqual(0);
    expect(placement.card.bottom).toBeLessThanOrEqual(placement.viewport.height);
    if (isMobile) {
      expect(placement.subject.bottom).toBeLessThanOrEqual(placement.card.top);
    } else {
      expect(placement.card.bottom).toBeLessThanOrEqual(placement.subject.top);
    }
    await expectNoSeriousAccessibilityViolations(page);
  });

  /**
   * With no Anki vocabulary set up there is nothing to mark, and the reader
   * says so by marking nothing. It used to print a notice above every reading
   * that could not be dismissed, which cost four lines on a phone to repeat
   * what the absence of underlines already said.
   */
  test('marks no words when vocabulary is not configured, and says nothing about it', async ({
    page,
  }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.is-warning-vocabulary')).toHaveCount(0);
    await expect(page.getByText(/Vocabulary markers are off/)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(/Anki/)).toHaveCount(0);
  });

  test('the reading surface is Japanese, with no controls printed on it', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    // Every button inside the text is a word. A sentence is reached by pressing
    // it, so nothing is printed for one.
    const buttons = page.locator('article.text button');
    expect(await buttons.count()).toBeGreaterThan(0);
    expect(await page.locator('article.text button:not(.token)').count()).toBe(0);
    await expect(page.locator('article.text [lang="en"]')).toHaveCount(0);
  });

  test('the sentence gesture opens it, and costs nothing', async ({ page, baseURL }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '')) {
        external.push(request.url());
      }
    });

    await openSentence(page);

    // No model is configured, so the offer is all there is — and it is an
    // offer, never a request made on the reader's behalf.
    await expect(page.locator('mn-sentence-popover')).toBeVisible();
    expect(external).toEqual([]);
  });

  test('dragging from a word selects clean Japanese and opens nothing @smoke', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'native touch selection is verified on an actual Android device');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const paragraph = page.locator('mn-reader-paragraph .paragraph').first();
    const start = await paragraph.locator('button.token').first().boundingBox();
    const end = await paragraph.locator('.token.is-plain').last().boundingBox();
    if (start === null || end === null) {
      throw new Error('reader text did not produce selectable bounds');
    }
    await page.mouse.move(start.x + 1, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width - 1, end.y + end.height / 2, { steps: 12 });
    await page.mouse.up();

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected.replace(/\s+/g, '')).toBe('吾輩は猫である。名前はまだ無い。');
    await expect(page.locator('.mn-popover-pane')).toHaveCount(0);
  });

  test('the sentence Copy action writes only its Japanese source @smoke', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await openSentence(page);
    await page.getByRole('button', { name: 'Copy', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('吾輩は猫である。');
  });

  test('a tap dismisses what is open instead of opening the next sentence @mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the touch dismissal route only exists on touch');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await openSentence(page);
    // The gesture a reader makes to put a sheet away. It used to land on the
    // text underneath and open the next sentence instead of closing anything.
    await tap(page, page.locator('article.text'));

    await expect(page.locator('mn-sentence-popover')).toHaveCount(0);
  });

  test('a tap opens a word, and one more tap moves on to the next @mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the two-tap problem only ever existed on touch');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await tap(page, page.getByRole('button', { name: new RegExp('猫') }).first());
    await expect(wordDetails(page).locator('.surface')).toContainText('猫');

    // The press that used to be spent closing the card over the previous word.
    await tap(page, page.getByRole('button', { name: new RegExp('名前') }).first());
    await expect(wordDetails(page).locator('.surface')).toContainText('名前');
    // And exactly one word is ever marked as the one being read.
    await expect(page.locator('button.token.is-selected')).toHaveCount(1);
  });

  test('a tap on the open word puts it away @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone is where a word is opened and closed by tapping');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const word = page.getByRole('button', { name: new RegExp('猫') }).first();
    await tap(page, word);
    await expect(wordDetails(page)).toBeVisible();

    await tap(page, word);

    await expect(wordDetails(page)).toHaveCount(0);
    await expect(page.locator('button.token.is-selected')).toHaveCount(0);
  });

  test('a tap leaves no hover behind on a phone @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a synthesized hover is a touch device problem');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await tap(page, page.getByRole('button', { name: new RegExp('猫') }).first());
    await expect(wordDetails(page)).toBeVisible();

    // The preview belongs to a pointer that can hover. On touch it used to
    // arrive alongside the details card, in a second colour, and stay behind
    // on the word after the card was dismissed.
    await expect(page.locator('button.is-previewed')).toHaveCount(0);
    await expect(page.locator('mn-word-preview')).toHaveCount(0);
  });

  test('the word a sheet explains stays visible above it @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'only a docked sheet can cover the word it is about');
    await page.goto('./#/add');
    await pasteAndContinue(
      page,
      Array.from({ length: 12 }, () => SAMPLE_TEXT).join(PARAGRAPH_BREAK),
    );
    await saveAndOpenReader(page);

    // A word in the lower half of the screen, which the sheet docks over.
    const words = page.locator('button.token');
    const lowIndex = await words.evaluateAll((elements) =>
      elements.findIndex((element) => {
        const box = element.getBoundingClientRect();
        return box.top > window.innerHeight / 2 && box.bottom < window.innerHeight;
      }),
    );
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    const low = words.nth(lowIndex);

    await tap(page, low);
    await expect(wordDetails(page)).toBeVisible();

    await expect
      .poll(async () => {
        const word = await low.boundingBox();
        const sheet = await page.locator('.mn-popover-pane .popover').boundingBox();
        return (word?.y ?? 0) + (word?.height ?? 0) - (sheet?.y ?? 0);
      })
      .toBeLessThanOrEqual(0);
  });

  test('the reading scrolls on with a sheet still open @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'only a docked sheet stays put while the page moves');
    await page.goto('./#/add');
    // Long enough that there is somewhere to scroll to behind the sheet.
    await pasteAndContinue(
      page,
      Array.from({ length: 12 }, () => SAMPLE_TEXT).join(PARAGRAPH_BREAK),
    );
    await saveAndOpenReader(page);

    await openSentence(page);
    await page.evaluate(() => {
      window.scrollBy(0, 600);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    // Nothing is pinned in place while a sheet is open. A blocked page is
    // frozen by being positioned, which is what used to trap the reader on the
    // line they had pressed.
    expect(
      await page.evaluate(() => window.getComputedStyle(document.documentElement).position),
    ).toBe('static');

    // Still open, and still where it was docked: a sheet is fixed to an edge
    // rather than to the line it explains.
    await expect(page.locator('mn-sentence-popover')).toBeVisible();
    const viewport = page.viewportSize();
    const card = await page.locator('.mn-popover-pane .popover').boundingBox();
    expect((card?.y ?? 0) + (card?.height ?? 0)).toBeCloseTo(viewport?.height ?? 0, 0);
  });

  test('docks the player and sheet without overlap while preserving reading context @mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'only docked surfaces share the viewport bottom');
    await page.setViewportSize({ width: 915, height: 412 });
    await importReading(page, SAMPLE_TEXT, 'Landscape overlays');

    await page.getByRole('button', { name: /^Audio$/ }).click();
    await openWordDetails(page, '猫');

    const player = page.getByRole('region', { name: 'Story audio' });
    const sheet = page.locator('.mn-popover-pane .popover');
    await expect
      .poll(async () => {
        const playerBox = await player.boundingBox();
        const sheetBox = await sheet.boundingBox();
        return (
          (sheetBox?.y ?? 0) + (sheetBox?.height ?? 0) - (playerBox?.y ?? Number.NEGATIVE_INFINITY)
        );
      })
      .toBeLessThanOrEqual(1);

    const placement = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.mn-popover-pane .popover');
      const playerElement = document.querySelector<HTMLElement>('[aria-label="Story audio"]');
      if (card === null || playerElement === null) {
        throw new Error('expected the sheet and player to be mounted');
      }
      const cardBox = card.getBoundingClientRect();
      const playerBox = playerElement.getBoundingClientRect();
      return {
        card: { top: cardBox.top, bottom: cardBox.bottom, height: cardBox.height },
        player: { top: playerBox.top },
        viewportHeight: window.innerHeight,
      };
    });
    expect(placement.card.top).toBeGreaterThanOrEqual(0);
    expect(placement.card.bottom).toBeLessThanOrEqual(placement.player.top + 1);
    expect(placement.card.height).toBeLessThanOrEqual(placement.viewportHeight * 0.6 + 1);
  });

  test('places an open player before the reading in keyboard order', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, 'Keyboard audio');

    const audio = page.getByRole('button', { name: /^Audio$/ });
    await audio.click();
    const player = page.getByRole('region', { name: 'Story audio' });
    // The region is rendered by a conditional block, so the order it is in is
    // only a fact about the document once it is in the document.
    await expect(player).toBeVisible();
    expect(
      await page.evaluate(() => {
        const playerElement = document.querySelector('[aria-label="Story audio"]');
        const firstToken = document.querySelector('button.token');
        return (
          playerElement !== null &&
          firstToken !== null &&
          (playerElement.compareDocumentPosition(firstToken) & Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
        );
      }),
    ).toBe(true);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Story options', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect
      .poll(() => player.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  });

  test('sentence details dock as a sheet on a phone, above the text they explain @mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'an anchored card is what a desktop viewport has room for');
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await openSentence(page);

    const pane = page.locator('.mn-popover-pane');
    await expect(pane).toHaveClass(/is-sheet/);
    const viewport = page.viewportSize();
    const card = await pane.locator('.popover').boundingBox();
    expect(card?.width).toBe(viewport?.width);
    // Docked: the bottom of the card is the bottom of the screen, so the sheet
    // is never half off the viewport the way an anchored card was.
    expect((card?.y ?? 0) + (card?.height ?? 0)).toBeCloseTo(viewport?.height ?? 0, 0);
    // And the way out is a real control, not only a gesture.
    await expect(pane.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('offers Settings when sentence translation has no model', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await openSentence(page);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();

    const popover = page.locator('mn-sentence-popover');
    await expect(popover.getByRole('alert')).toContainText('No translation model is configured');
    await expect(popover.getByRole('link', { name: 'Open Settings' })).toBeVisible();
    await expect(popover).not.toContainText('Choose a different model');
  });

  test('the text scale changes the reading, and is remembered', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const paragraph = page.locator('mn-reader-paragraph p').first();
    const before = await paragraph.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );

    await page.getByRole('button', { name: 'Story options', exact: true }).click();
    await page.getByLabel('Text size').fill('1.5');
    await page.keyboard.press('Escape');

    await expect
      .poll(() =>
        paragraph.evaluate((element) =>
          Number.parseFloat(window.getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(before);

    await page.reload();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    const afterReload = await paragraph.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );
    expect(afterReload).toBeGreaterThan(before);
  });

  test('reader appearance is changed and remembered in Story options', async ({ page }) => {
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await page.getByRole('button', { name: 'Story options', exact: true }).click();
    const furigana = page.getByRole('checkbox', { name: 'Furigana' });
    await expect(furigana).toBeChecked();
    await furigana.uncheck();
    await expectSettingPersisted(page, 'reader-preferences', 'furigana', false);
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByRole('button', { name: 'Story options', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Furigana' })).not.toBeChecked();
  });

  test('keeps every Reader action usable in the compact 320px header @mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('./#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const header = page.locator('.bar-row');
    await expect(header.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(header.getByRole('button', { name: /^Audio/ })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Story options', exact: true })).toBeVisible();

    const actions = header.locator('.bar-actions > button, .bar-actions > mn-reader-menu');
    await expect(actions).toHaveCount(2);
    await expect(actions.nth(0)).toHaveClass(/audio-button/);
    await expect(actions.nth(1)).toHaveJSProperty('tagName', 'MN-READER-MENU');

    const bounds = await header.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('has no serious accessibility violations across the workflow @mobile @smoke', async ({
    page,
  }) => {
    await page.goto('./#/add');
    await expectNoSeriousAccessibilityViolations(page);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await expectNoSeriousAccessibilityViolations(page);

    await saveAndOpenReader(page);
    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** End-to-end scenario 2: pasted text validation. */
test.describe('scenario 2 — pasted text validation', () => {
  test('guards an unsaved import when navigating back', async ({ page }) => {
    await page.goto('./#/library');
    await page.getByRole('link', { name: /Paste Japanese text/ }).click();
    await page.getByLabel('Japanese text').fill(SAMPLE_TEXT);

    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Leave without saving?');
    await page.getByRole('button', { name: 'Stay here' }).click();
    await expect(page).toHaveURL(/#\/add$/);
  });

  test('replaces the import form after saving', async ({ page }) => {
    await page.goto('./#/library');
    await page.getByRole('link', { name: /Paste Japanese text/ }).click();
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);
    await page.goBack();

    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page).not.toHaveURL(/#\/add/);
  });

  test('keeps Add story disabled for pasted text over the 50,000-character limit', async ({
    page,
  }) => {
    await page.goto('./#/add');
    await page.getByLabel('Japanese text').fill('あ'.repeat(50_001));

    await expect(page.getByText('50,001 of 50,000 characters')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Remove 1 character to continue');
    await expect(page.getByRole('button', { name: 'Add story' })).toBeDisabled();
    await expect(page).toHaveURL(/#\/add/);
  });

  test('blocks empty input with an inline message @smoke', async ({ page }) => {
    await page.goto('./#/add');
    await page.getByLabel('Japanese text').fill('   \n  ');

    await expect(page.getByRole('button', { name: 'Add story' })).toBeDisabled();
  });
});

/** End-to-end scenario 14: filtering, resume, deletion cascade, and repair. */
test.describe('scenario 14 — library, filtering, deletion', () => {
  test('restores Library context with both in-app and browser Back', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.getByRole('link', { name: 'Back to library' }).click();
    await page.addStyleTag({ content: 'mn-reading-card { display: block; margin-top: 80rem; }' });
    await page.getByRole('link', { name: '第一章' }).scrollIntoViewIfNeeded();
    const libraryScroll = await page.evaluate(() => window.scrollY);
    expect(libraryScroll).toBeGreaterThan(100);

    await page.getByRole('link', { name: '第一章' }).click();
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    await page.getByRole('link', { name: '第一章' }).click();
    await page.goBack();
    await expect(page).toHaveURL(/#\/library$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('replaces a deleted reader so browser Back cannot reopen it', async ({ page }) => {
    await page.goto('./#/library');
    await page.getByRole('link', { name: /Paste Japanese text/ }).click();
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);
    const deletedUrl = page.url();

    await page.getByRole('button', { name: 'Story options', exact: true }).click();
    await page.getByRole('button', { name: 'Delete story…', exact: true }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page).toHaveURL(/#\/library$/);

    await page.goBack();
    await expect(page).not.toHaveURL(deletedUrl);
    // The last reading is gone, so the Library is a first visit again.
    await expect(
      page.getByRole('heading', { name: /Japanese you can actually read/, level: 2 }),
    ).toBeVisible();
  });

  /** A compact row identifies the reading without repeating its contents. */
  test('a dated library row shows the title and character count without a preview', async ({
    page,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');

    const card = page.locator('mn-reading-card');
    await expect(card).toContainText('第一章');
    await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toBeVisible();
    await expect(card).toContainText(/\d+ characters/);
    await expect(card).not.toContainText('吾輩は猫である');
    await expect(card).not.toContainText('sentences');
    await expect(card).not.toContainText('none yet');
    await expect(card).not.toContainText('Last opened');
    await expect(card.getByRole('button', { name: 'Read' })).toHaveCount(0);
  });

  /** Chips are chrome until there are enough readings for filtering to help. */
  test('hides the filter chips on a shelf too small to need them @mobile', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Filter stories' })).toHaveCount(0);
  });

  test('dismisses a reading actions menu on outside press and Escape', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');

    const toggle = page.getByRole('button', { name: 'Actions for 第一章' });
    const menu = page.getByRole('menu', { name: 'Actions for 第一章' });

    await toggle.click();
    await expect(menu).toBeVisible();
    await page.getByRole('heading', { name: 'Library', level: 1 }).click();
    await expect(menu).toBeHidden();

    await toggle.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('deleting asks first, then leaves zero owned orphan rows @smoke', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('The text and 3 sentences');
    await expect(dialog).toContainText('reviewed vocabulary');

    await dialog.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.getByRole('link', { name: /Paste Japanese text/ })).toBeVisible();
    const counts = await countOwnedRows(page);
    for (const [store, count] of Object.entries(counts)) {
      expect(count, `rows left in ${store}`).toBe(0);
    }
  });

  test('cancelling the confirmation keeps the reading', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
  });

  test('deleting one reading leaves the others on the shelf', async ({ page }) => {
    await importReading(page, '最初の話です。', '第一章');
    await importReading(page, '二番目の話です。', '第二章');
    await page.goto('./#/library');
    await expect(page.locator('mn-reading-card')).toHaveCount(2);

    await page.getByRole('button', { name: 'Actions for 第二章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
  });

  test('a returning profile with readings opens the library', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');

    await page.goto('./');
    await expect(page).toHaveURL(/#\/library/);
  });

  test('has no serious accessibility violations in the library @mobile', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('./#/library');
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** End-to-end scenario 15, reading half: offline reload and allowed operations. */
test.describe('scenario 15 — offline reading', () => {
  // The service-worker shell fallback that survives a full offline reload is
  // Milestone 10. What this milestone promises is that everything reading needs
  // is already local, so these navigate inside the running application with the
  // network removed.
  test('a saved reading reopens and inspects with the network removed @smoke', async ({
    page,
    context,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    // Visit the library once while online so its lazy route chunk is loaded;
    // serving code offline is the service worker's job in Milestone 10, whereas
    // what this scenario proves is that the reading data and aids are local.
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await context.setOffline(true);

    await page.getByRole('link', { name: '第一章' }).click();
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);

    await openWordDetails(page, '猫');
    await expect(wordDetails(page)).toContainText('cat');
  });

  test('the library lists saved readings with the network removed', async ({ page, context }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(page.locator('mn-reading-card')).toHaveCount(1);

    await context.setOffline(true);
    // Navigating inside the running application, because serving the shell
    // after a full reload is the service worker's job in Milestone 10. What
    // this proves is that listing the library needs nothing but local data.
    await page.getByRole('link', { name: '第一章' }).click();
    await expect(page.locator('mn-reader-paragraph').first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to library' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
  });
});

test('adds an unknown word locally from the reader @smoke @mobile', async ({ page, context }) => {
  await importReading(page, '猫がいる。');
  await openWordDetails(page, '猫');
  await context.setOffline(true);
  await wordDetails(page).getByRole('button', { name: 'Add to word list', exact: true }).click();
  await expect(wordDetails(page).getByRole('status')).toContainText('Added to Reader words');
  await expect(wordDetails(page).getByRole('button', { name: 'Add to word list' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await context.setOffline(false);
  await page.goto('./#/reading-level');
  await expect(page.getByText('Reader words', { exact: true })).toBeVisible();
});

test('uses one keyboard stop per sentence and returns from word details @smoke', async ({
  page,
}) => {
  await importReading(page, '猫がいる。犬が来た。\n\n鳥が飛ぶ。', '動物');
  const sentences = page.locator('.sentence');
  await expect(sentences).toHaveCount(3);
  expect(await page.locator('article.text button.token').count()).toBeGreaterThan(3);
  await expect(page.locator('article.text button.token[tabindex="0"]')).toHaveCount(3);
  await expect(page.locator('mn-reader-paragraph p.paragraph')).toHaveCount(2);
  const first = sentences.first().locator('button.token');
  await first.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(first.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Word details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first.nth(1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sentences.nth(1).locator('button.token[tabindex="0"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sentences.nth(2).locator('button.token[tabindex="0"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#mn-after-story')).toBeFocused();
  await expect(page.getByRole('heading', { name: '動物', exact: true })).toHaveAttribute(
    'lang',
    'ja',
  );
  await page.locator('#mn-after-story').click();
  await expect(page.getByRole('link', { name: '動物', exact: true })).toHaveAttribute('lang', 'ja');
});

test('renames a pasted reading from the library @smoke', async ({ page }) => {
  // A pasted reading is titled with its own first sentence, so its name and the
  // first line of its text are the same string until it can be renamed.
  await importReading(page, '猫がいる。犬が来た。', '猫がいる。');
  await page.goto('./#/library');

  await page.getByRole('button', { name: 'Actions for 猫がいる。' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByLabel('Title').fill('猫の一日');
  await page.getByRole('button', { name: 'Save name' }).click();

  const renamed = page.getByRole('link', { name: '猫の一日', exact: true });
  await expect(renamed).toBeVisible();
  await expect(renamed).toHaveAttribute('lang', 'ja');

  // The name is stored, not just repainted, and the reading still opens.
  await page.reload();
  await page.getByRole('link', { name: '猫の一日', exact: true }).click();
  await expect(page.getByRole('heading', { name: '猫の一日' })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp('猫') }).first()).toBeVisible();
});

test('gives an unrecognised reading link the app chrome and a way back', async ({ page }) => {
  await page.goto('./#/reader/not-a-real-id');

  await expect(page.getByRole('link', { name: 'Monosai' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Link not recognised' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to library' }).click();
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
});
