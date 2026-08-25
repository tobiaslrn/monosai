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
  await page.getByRole('button', { name: 'Aids' }).click();
  const panel = page.getByRole('group', { name: 'Reading aids' });
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
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
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
    const spacing = Number.parseFloat(getComputedStyle(groups[1]).marginInlineStart) || 0;
    const width = Math.ceil(secondWidth + spacing + 4);
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
      groupRights: groupRects.map((rect) => rect.right),
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(layout.text, label).toEqual(['名前が', 'あります。']);
  expect(layout.tops[1], label).toBeGreaterThan(layout.tops[0]);
  expect(new Set(layout.secondTokenTops), label).toEqual(new Set([layout.secondTokenTops[0]]));
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
   * An empty library is the first screen, not a form nobody asked for. It says
   * both starting paths and keeps the New reading action available.
   */
  test('a first visit lands on an empty library and needs no setup', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/#\/library/);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add Japanese you already have' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Generate from reviewed Anki vocabulary' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New reading' })).toBeVisible();
  });

  test('New reading offers both ways in, and Paste text reaches the reader', async ({ page }) => {
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'New reading' }).click();
    const chooser = page.getByRole('dialog', { name: 'New reading' });
    await expect(chooser.getByRole('link', { name: 'Paste text' })).toBeVisible();
    await expect(chooser.getByRole('link', { name: 'Write with AI' })).toBeVisible();

    await chooser.getByRole('link', { name: 'Paste text' }).click();
    await expect(page).toHaveURL(/#\/add/);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
  });

  test('paste, save, and read without a review step', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);

    await saveAndOpenReader(page);
    await expect(page.locator('mn-reader-paragraph')).toHaveCount(2);
  });

  test('uses singular wording for a one-sentence paragraph', async ({ page }) => {
    await page.goto('/#/add');
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
    await page.goto('/#/reader/does-not-exist');

    await expect(
      page.getByRole('heading', { name: 'Reading unavailable', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aids' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Audio/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reading actions' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('This reading is no longer here');
    await expect(
      page.getByRole('alert').getByRole('link', { name: 'Back to library' }),
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

    const toggle = page.getByRole('button', { name: 'Reading actions' });
    const menu = page.getByRole('menu', { name: 'Reading actions' });
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
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.sentence[lang="ja"]').first()).toBeVisible();
    // Ruby is whole-token and only where a reading adds information.
    await expect(page.locator('ruby', { hasText: '猫' }).first().locator('rt')).toHaveText('ねこ');
  });

  test('wraps fitting bunsetsu atomically without horizontal overflow', async ({ page }) => {
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

  test('inspecting a word shows local details with no request leaving the origin', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/#/add');
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
    await expect(wordDetails(page).locator('.dictionary-form')).toHaveText('猫');
    await expect(wordDetails(page).locator('.part-of-speech')).toHaveText('noun');
    await expect(wordDetails(page).locator('.form-line')).toHaveCount(0);
    // The sentence is not repeated here: the learner is looking at it.
    await expect(wordDetails(page)).not.toContainText('In this sentence');
    expect(external).toEqual([]);
  });

  test('hovering a morpheme tints the whole word', async ({ page }) => {
    await page.goto('/#/add');
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
    await page.goto('/#/add');
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
    await page.goto('/#/add');
    await pasteAndContinue(page, '僕には分からなかった。昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '分から');
    const details = wordDetails(page);

    await expect(details.locator('.surface')).toHaveText('分からなかった');
    await expect(details.locator('.reading')).toHaveText('わからなかった');
    await expect(details.locator('.dictionary-form')).toHaveText('分かる');
    await expect(details.locator('.part-of-speech')).toHaveText('verb');
    await expect(details.locator('.form-line')).toHaveText('Plain · negative · past');
    await expect(details.locator('.derivation, .step, .detail, .tinted')).toHaveCount(0);

    await expectNoSeriousAccessibilityViolations(page);
  });

  test('a polite negative past keeps only the high-level form labels', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, '昨日は学校へ行きませんでした。');
    await saveAndOpenReader(page);

    await openWordDetails(page, '行き');
    const details = wordDetails(page);

    await expect(details.locator('.form-line')).toHaveText('Polite · negative · past');
    await expect(details).not.toContainText('行きませんです');
    await expect(details.locator('.derivation, .step, .detail')).toHaveCount(0);
  });

  test('reaches More from the keyboard and expands all dictionary meanings', async ({ page }) => {
    await page.goto('/#/add');
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
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const token = page.getByRole('button', { name: new RegExp('猫') }).first();
    await token.click();
    await expect(wordDetails(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(wordDetails(page)).not.toBeAttached();
    await expect(token).toBeFocused();
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
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await expect(page.locator('.is-warning-vocabulary')).toHaveCount(0);
    await expect(page.getByText(/Vocabulary markers are off/)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(/Anki/)).toHaveCount(0);
  });

  test('the reading surface is Japanese, with no controls printed on it', async ({ page }) => {
    await page.goto('/#/add');
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
    await page.goto('/#/add');
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

  test('a tap dismisses what is open instead of opening the next sentence', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the tap-versus-long-press split only exists on touch');
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await openSentence(page);
    // The gesture a reader makes to put a sheet away. It used to land on the
    // text underneath and open the next sentence instead of closing anything.
    await tap(page, page.locator('article.text'));

    await expect(page.locator('mn-sentence-popover')).toHaveCount(0);
  });

  test('a tap opens a word, and one more tap moves on to the next', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the two-tap problem only ever existed on touch');
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await tap(page, page.getByRole('button', { name: new RegExp('猫') }).first());
    await expect(wordDetails(page).locator('.dictionary-form')).toHaveText('猫');

    // The press that used to be spent closing the card over the previous word.
    await tap(page, page.getByRole('button', { name: new RegExp('名前') }).first());
    await expect(wordDetails(page).locator('.dictionary-form')).toHaveText('名前');
    // And exactly one word is ever marked as the one being read.
    await expect(page.locator('button.token.is-selected')).toHaveCount(1);
  });

  test('a tap on the open word puts it away', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone is where a word is opened and closed by tapping');
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const word = page.getByRole('button', { name: new RegExp('猫') }).first();
    await tap(page, word);
    await expect(wordDetails(page)).toBeVisible();

    await tap(page, word);

    await expect(wordDetails(page)).toHaveCount(0);
    await expect(page.locator('button.token.is-selected')).toHaveCount(0);
  });

  test('a tap leaves no hover behind on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a synthesized hover is a touch device problem');
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await tap(page, page.getByRole('button', { name: new RegExp('猫') }).first());
    await expect(wordDetails(page)).toBeVisible();

    // The preview belongs to a pointer that can hover. On touch it used to
    // arrive alongside the details card, in a second colour, and stay behind
    // on the word after the card was dismissed.
    await expect(page.locator('button.is-previewed')).toHaveCount(0);
    await expect(page.locator('mn-word-preview')).toHaveCount(0);
    await expect(page.locator('.sentence.is-pressing')).toHaveCount(0);
  });

  test('the word a sheet explains stays visible above it', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'only a docked sheet can cover the word it is about');
    await page.goto('/#/add');
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

  test('the reading scrolls on with a sheet still open', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'only a docked sheet stays put while the page moves');
    await page.goto('/#/add');
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

  test('sentence details dock as a sheet on a phone, above the text they explain', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'an anchored card is what a desktop viewport has room for');
    await page.goto('/#/add');
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
    await page.goto('/#/add');
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
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const paragraph = page.locator('mn-reader-paragraph p').first();
    const before = await paragraph.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );

    await page.getByRole('button', { name: 'Aids' }).click();
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

  test('reader aid switches are changed and remembered in the Aids panel', async ({ page }) => {
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    await page.getByRole('button', { name: 'Aids' }).click();
    const furigana = page.getByRole('checkbox', { name: 'Furigana' });
    await expect(furigana).toBeChecked();
    await furigana.uncheck();
    await expectSettingPersisted(page, 'reader-preferences', 'furigana', false);
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByRole('button', { name: 'Aids' }).click();
    await expect(page.getByRole('checkbox', { name: 'Furigana' })).not.toBeChecked();
  });

  test('keeps every Reader action usable in the compact 320px header', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#/add');
    await pasteAndContinue(page, SAMPLE_TEXT);
    await saveAndOpenReader(page);

    const header = page.locator('.bar-row');
    await expect(header.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(header.getByRole('button', { name: /^Audio/ })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Aids' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Reading actions' })).toBeVisible();

    const actions = header.locator(
      '.bar-actions > button, .bar-actions > mn-reader-aids, .bar-actions > mn-reader-menu',
    );
    await expect(actions).toHaveCount(3);
    await expect(actions.nth(0)).toHaveJSProperty('tagName', 'MN-READER-AIDS');
    await expect(actions.nth(1)).toHaveClass(/audio-button/);
    await expect(actions.nth(2)).toHaveJSProperty('tagName', 'MN-READER-MENU');

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

  test('has no serious accessibility violations across the workflow', async ({ page }) => {
    await page.goto('/#/add');
    await expectNoSeriousAccessibilityViolations(page);

    await pasteAndContinue(page, SAMPLE_TEXT);
    await expectNoSeriousAccessibilityViolations(page);

    await saveAndOpenReader(page);
    await expectNoSeriousAccessibilityViolations(page);
  });
});

/** End-to-end scenario 2: pasted text validation. */
test.describe('scenario 2 — pasted text validation', () => {
  test('keeps Add reading disabled for pasted text over the 50,000-character limit', async ({
    page,
  }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('あ'.repeat(50_001));

    await expect(page.getByText('50,001 of 50,000 characters')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Remove 1 character to continue');
    await expect(page.getByRole('button', { name: 'Add reading' })).toBeDisabled();
    await expect(page).toHaveURL(/#\/add/);
  });

  test('blocks empty input with an inline message', async ({ page }) => {
    await page.goto('/#/add');
    await page.getByLabel('Japanese text').fill('   \n  ');

    await expect(page.getByRole('button', { name: 'Add reading' })).toBeDisabled();
  });
});

/** End-to-end scenario 14: filtering, resume, deletion cascade, and repair. */
test.describe('scenario 14 — library, filtering, deletion', () => {
  /** A compact row identifies the reading without repeating its contents. */
  test('a dated library row shows the title and character count without a preview', async ({
    page,
  }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

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
  test('hides the filter chips on a shelf too small to need them', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Filter readings' })).toHaveCount(0);
  });

  test('dismisses a reading actions menu on outside press and Escape', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    const toggle = page.getByRole('button', { name: 'Actions for 第一章' });
    const menu = page.getByRole('menu', { name: '第一章 actions' });

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

  test('deleting asks first, then leaves zero owned orphan rows', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('The text and 3 sentences');
    await expect(dialog).toContainText('reviewed vocabulary');

    await dialog.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.getByRole('link', { name: 'Add Japanese you already have' })).toBeVisible();
    const counts = await countOwnedRows(page);
    for (const [store, count] of Object.entries(counts)) {
      expect(count, `rows left in ${store}`).toBe(0);
    }
  });

  test('cancelling the confirmation keeps the reading', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');

    await page.getByRole('button', { name: 'Actions for 第一章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
  });

  test('deleting one reading leaves the others on the shelf', async ({ page }) => {
    await importReading(page, '最初の話です。', '第一章');
    await importReading(page, '二番目の話です。', '第二章');
    await page.goto('/#/library');
    await expect(page.locator('mn-reading-card')).toHaveCount(2);

    await page.getByRole('button', { name: 'Actions for 第二章' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.locator('mn-reading-card')).toHaveCount(1);
    await expect(page.locator('mn-reading-card')).toContainText('第一章');
  });

  test('a returning profile with readings opens the library', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');

    await page.goto('/');
    await expect(page).toHaveURL(/#\/library/);
  });

  test('has no serious accessibility violations in the library', async ({ page }) => {
    await importReading(page, SAMPLE_TEXT, '第一章');
    await page.goto('/#/library');
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
  test('a saved reading reopens and inspects with the network removed', async ({
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
