import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CALENDAR_WEEKS,
  SAMPLE_READING_FIGURES,
  sampleHeatLevels,
} from './sample-reading-progress';

describe('sampleHeatLevels', () => {
  it('gives one level to every day of the calendar', () => {
    expect(sampleHeatLevels()).toHaveLength(SAMPLE_CALENDAR_WEEKS * 7);
    expect(sampleHeatLevels()).toHaveLength(112);
  });

  it('draws the same calendar every time', () => {
    expect(sampleHeatLevels()).toEqual(sampleHeatLevels());
  });

  it('keeps every level on the five-step scale', () => {
    for (const level of sampleHeatLevels()) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(4);
      expect(Number.isInteger(level)).toBe(true);
    }
  });

  /** The calendar and its heading must tell the same story. */
  it('shows exactly the streak its heading states, ending today', () => {
    const levels = sampleHeatLevels();
    const streak = SAMPLE_READING_FIGURES.streakDays;

    for (const level of levels.slice(-streak)) {
      expect(level).toBeGreaterThanOrEqual(2);
    }
    expect(levels.at(-streak - 1)).toBe(0);
  });
});
