import { describe, expect, it } from 'vitest';
import type { GrammarSummary } from '../../domain/reading/summaries';
import { completionLabel, grammarLabel, relativeDay } from './reading-summary-labels';

describe('completionLabel', () => {
  it('reports nothing attempted as none yet', () => {
    expect(completionLabel('Translations', { total: 5, completed: 0, failed: 0 })).toBe(
      'Translations: none yet',
    );
  });

  it('reports every sentence covered as complete', () => {
    expect(completionLabel('Translations', { total: 5, completed: 5, failed: 0 })).toBe(
      'Translations: complete',
    );
  });

  it('reports a partial result against the reading total, not against what succeeded', () => {
    expect(completionLabel('Translations', { total: 5, completed: 3, failed: 2 })).toBe(
      'Translations: 3 of 5',
    );
  });
});

describe('grammarLabel', () => {
  const cases: readonly { readonly summary: GrammarSummary; readonly label: string }[] = [
    { summary: { state: 'not-requested' }, label: 'Grammar: not reviewed' },
    {
      summary: { state: 'unavailable', reasonCode: 'malformed-response' },
      label: 'Grammar: unavailable',
    },
    {
      summary: { state: 'partial', analyzedSentenceCount: 3, concernCount: 0 },
      label: 'Grammar: 3 reviewed, no notes',
    },
    {
      summary: { state: 'partial', analyzedSentenceCount: 3, concernCount: 1 },
      label: 'Grammar: 3 reviewed, 1 note',
    },
    { summary: { state: 'complete', concernCount: 0 }, label: 'Grammar: reviewed, no notes' },
    { summary: { state: 'complete', concernCount: 2 }, label: 'Grammar: reviewed, 2 notes' },
  ];

  for (const { summary, label } of cases) {
    it(`renders ${summary.state} as “${label}”`, () => {
      expect(grammarLabel(summary)).toBe(label);
    });
  }

  it('never implies the Japanese is wrong', () => {
    for (const { summary } of cases) {
      expect(grammarLabel(summary)).not.toMatch(/error|invalid|wrong/i);
    }
  });
});

describe('relativeDay', () => {
  const noon = new Date(2026, 7, 21, 12, 0, 0).getTime();

  it('says today for another moment on the same day', () => {
    expect(relativeDay(new Date(2026, 7, 21, 1, 30, 0).getTime(), noon)).toBe('today');
  });

  it('says yesterday for late the previous night rather than a count of hours', () => {
    expect(relativeDay(new Date(2026, 7, 20, 23, 45, 0).getTime(), noon)).toBe('yesterday');
  });

  it('counts whole days within the last week', () => {
    expect(relativeDay(new Date(2026, 7, 18, 9, 0, 0).getTime(), noon)).toBe('3 days ago');
  });

  it('falls back to a date once a relative day stops being useful', () => {
    const old = new Date(2026, 0, 4, 9, 0, 0).getTime();
    expect(relativeDay(old, noon)).toBe(new Date(old).toLocaleDateString());
  });
});
