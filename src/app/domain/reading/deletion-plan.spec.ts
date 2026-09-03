import { describe, expect, it } from 'vitest';
import { readingId } from '../shared/ids';
import { describeDeletion, OWNED_READING_STORES } from './deletion-plan';
import type { ImportedReading } from './reading';

function reading(overrides: Partial<ImportedReading> = {}): ImportedReading {
  return {
    id: readingId('r1'),
    kind: 'imported',
    title: '第一章',
    createdAt: 1_000,
    updatedAt: 1_000,
    sentenceCount: 12,
    lastOpenedAt: null,
    characterCount: 240,
    excerpt: '第一章の冒頭です。',
    translationSummary: { total: 12, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 12, completed: 0, failed: 0 },
    preparationTargets: [],
    analyzerVersion: '1',
    importSource: 'paste',
    sourceTextHash: 'h',
    ...overrides,
  };
}

describe('describeDeletion', () => {
  it('always names the text and the sentence count', () => {
    const plan = describeDeletion(reading());
    expect(plan.title).toBe('第一章');
    expect(plan.removes[0]).toBe('The text and 12 sentences');
    expect(plan.isPermanent).toBe(true);
  });

  it('does not promise to delete aids the reading never had', () => {
    const plan = describeDeletion(reading());
    expect(plan.removes.join(' ')).not.toContain('translation');
    expect(plan.removes.join(' ')).not.toContain('audio');
    expect(plan.removes.join(' ')).not.toContain('grammar');
  });

  it('lists the aids that do exist', () => {
    const plan = describeDeletion(
      reading({
        translationSummary: { total: 12, completed: 12, failed: 0 },
        audioSummary: { total: 12, completed: 3, failed: 0 },
        grammarSummary: { state: 'partial', analyzedSentenceCount: 2, concernCount: 1 },
      }),
    );
    expect(plan.removes).toContain('12 saved translations');
    expect(plan.removes).toContain('3 saved audio clips');
    expect(plan.removes).toContain('Saved grammar analyses');
  });

  it('uses the singular for a one-sentence reading and a single clip', () => {
    const plan = describeDeletion(
      reading({
        sentenceCount: 1,
        audioSummary: { total: 1, completed: 1, failed: 0 },
      }),
    );
    expect(plan.removes[0]).toBe('The text and 1 sentence');
    expect(plan.removes).toContain('1 saved audio clip');
  });

  it('names a job that is running, so the learner knows what deleting stops', () => {
    const plan = describeDeletion(reading(), { translationRunning: true, audioRunning: true });
    expect(plan.removes).toContain('The translation currently in progress');
    expect(plan.removes).toContain('The audio generation currently in progress');
  });

  it('says nothing about jobs when none is running', () => {
    const plan = describeDeletion(reading(), { translationRunning: false, audioRunning: false });
    expect(plan.removes.join(' ')).not.toContain('in progress');
  });

  it('states that vocabulary and settings survive', () => {
    const plan = describeDeletion(reading());
    expect(plan.preserves.join(' ')).toContain('vocabulary');
    expect(plan.preserves.join(' ')).toContain('settings');
  });
});

describe('OWNED_READING_STORES', () => {
  it('names every store the cascade must clear, with no duplicates', () => {
    expect(new Set(OWNED_READING_STORES).size).toBe(OWNED_READING_STORES.length);
    expect(OWNED_READING_STORES).toContain('sentences');
    expect(OWNED_READING_STORES).toContain('tokenAnalyses');
  });

  it('does not claim shared data as owned', () => {
    const owned: readonly string[] = OWNED_READING_STORES;
    expect(owned).not.toContain('vocabularySnapshots');
    expect(owned).not.toContain('settings');
    expect(owned).not.toContain('credentials');
  });
});
