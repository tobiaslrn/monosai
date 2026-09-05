import { describe, expect, it } from 'vitest';
import {
  APP_LOCALE,
  formatCount,
  formatCountOf,
  formatDate,
  formatDateTime,
  formatRelativeDay,
  formatRelativeDays,
} from './locale';

/**
 * The point of one locale is that no screen can mix two. These assertions are
 * deliberately literal: they fail if a formatter ever starts reading the host's
 * locale, which is exactly the regression that produced `50,000` beside
 * `31.8.2026`.
 */
describe('application locale', () => {
  it('is the one the interface is written in', () => {
    expect(APP_LOCALE).toBe('en');
  });

  it('groups counts the same way everywhere', () => {
    expect(formatCount(50_000)).toBe('50,000');
    expect(formatCount(3118)).toBe('3,118');
    expect(formatCount(0)).toBe('0');
  });

  it('agrees with the number a bare English format would produce', () => {
    expect(formatCount(50_000)).toBe((50_000).toLocaleString('en'));
  });

  it('keeps the singular for exactly one', () => {
    expect(formatCountOf(1, 'character')).toBe('1 character');
    expect(formatCountOf(0, 'character')).toBe('0 characters');
    expect(formatCountOf(3118, 'character')).toBe('3,118 characters');
  });

  it('takes an irregular plural where the noun needs one', () => {
    expect(formatCountOf(2, 'analysis', 'analyses')).toBe('2 analyses');
  });

  it('formats dates and times in the application locale, not the host one', () => {
    const moment = new Date(2026, 7, 31, 17, 26, 40).getTime();

    expect(formatDate(moment)).toBe('Aug 31, 2026');
    expect(formatDateTime(moment)).toBe('Aug 31, 2026, 5:26 PM');
  });

  it('names relative days in words', () => {
    expect(formatRelativeDays(0)).toBe('today');
    expect(formatRelativeDays(-1)).toBe('yesterday');
    expect(formatRelativeDays(-3)).toBe('3 days ago');
  });
});

describe('formatRelativeDay', () => {
  const noon = new Date(2026, 7, 21, 12, 0, 0).getTime();

  it('says today for another moment on the same day', () => {
    expect(formatRelativeDay(new Date(2026, 7, 21, 1, 30, 0).getTime(), noon)).toBe('today');
  });

  it('says yesterday for late the previous night rather than a count of hours', () => {
    expect(formatRelativeDay(new Date(2026, 7, 20, 23, 45, 0).getTime(), noon)).toBe('yesterday');
  });

  it('counts whole days within the last week', () => {
    expect(formatRelativeDay(new Date(2026, 7, 18, 9, 0, 0).getTime(), noon)).toBe('3 days ago');
  });

  /** The application's one locale, not the browser's. See ADR 0042 and §8. */
  it('falls back to a date in the application locale once a day count stops helping', () => {
    const old = new Date(2026, 0, 4, 9, 0, 0).getTime();
    expect(formatRelativeDay(old, noon)).toBe('Jan 4, 2026');
  });
});
