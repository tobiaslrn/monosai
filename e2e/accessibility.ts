import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails the test on any serious or critical automated accessibility finding. */
export async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
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
