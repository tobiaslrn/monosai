/**
 * The one locale Monosai formats in.
 *
 * The interface is English-only — `<html lang="en">`, every label written once,
 * no translation layer — so a number and a date rendered next to each other
 * must agree. Reading the browser's locale for dates while forcing English for
 * numbers produced screens that mixed two conventions in one line: `50,000`
 * beside `31.8.2026`.
 *
 * The policy is therefore: **format everything in `en`, explicitly, and never
 * call a `toLocale*` method with no locale argument.** Japanese text is content
 * and is never formatted; it carries `lang="ja"` where it is rendered.
 *
 * See `docs/design-system.md` §8 for the rule this file implements.
 */
export const APP_LOCALE = 'en';

const COUNT_FORMAT = new Intl.NumberFormat(APP_LOCALE);
const DATE_FORMAT = new Intl.DateTimeFormat(APP_LOCALE, { dateStyle: 'medium' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const RELATIVE_DAY_FORMAT = new Intl.RelativeTimeFormat(APP_LOCALE, { numeric: 'auto' });

/** A whole count, grouped: `3,118`. Used for every number the learner reads. */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

/**
 * A count with its noun, singular and plural handled: `1 character`,
 * `3,118 characters`.
 */
export function formatCountOf(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(value)} ${value === 1 ? singular : plural}`;
}

/** A calendar day: `Aug 31, 2026`. */
export function formatDate(timestamp: number): string {
  return DATE_FORMAT.format(timestamp);
}

/** A day and a time: `Aug 31, 2026, 5:26 PM`. */
export function formatDateTime(timestamp: number): string {
  return DATE_TIME_FORMAT.format(timestamp);
}

/** A whole number of days from now: `today`, `yesterday`, `3 days ago`. */
export function formatRelativeDays(days: number): string {
  return RELATIVE_DAY_FORMAT.format(days, 'day');
}
