import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Fails the test on any serious or critical automated accessibility finding.
 *
 * Transitions are waited out first. A control whose colours are mid-transition —
 * a primary button fading from its disabled treatment to its enabled one —
 * measures as whatever blend the sampler caught, which axe reports as a contrast
 * failure of colours the screen never rests on.
 *
 * Only animations that run in time are waited for. One driven by the scroll
 * position — a top bar's edge fading in — is `running` for as long as the page
 * exists, and its value is already the one the screen rests on.
 */
export async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(animation.timeline instanceof DocumentTimeline) || animation.playState !== 'running',
      ),
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(
    blocking.flatMap((violation) =>
      violation.nodes.map(
        (node) => `${violation.id}: ${violation.help} at ${node.target.join(' > ')}`,
      ),
    ),
    'serious or critical accessibility violations',
  ).toEqual([]);
}
