import { describe, expect, it } from 'vitest';
import {
  IDLE_ACTION,
  NO_AIDS,
  type SentenceAids,
} from '../../application/enrichment/sentence-aids.store';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import { readingId, sentenceId } from '../../domain/shared/ids';
import { sentenceMenuActions } from './sentence-menu.component';

const SENTENCE_ID = sentenceId('s1');
const READING_ID = readingId('r1');

const TRANSLATION: TranslationRecord = {
  id: 't1',
  sentenceId: SENTENCE_ID,
  readingId: READING_ID,
  sourceContentHash: 'hash-0',
  textEn: 'The cat walked.',
  modelId: 'vendor/model',
  promptVersion: 'translation/1',
  cacheKey: 'key-t1',
  createdAt: 1,
};

const GRAMMAR: GrammarAnalysisRecord = {
  id: 'g1',
  sentenceId: SENTENCE_ID,
  readingId: READING_ID,
  sourceContentHash: 'hash-0',
  profileHash: 'profile-1',
  modelId: 'vendor/model',
  promptVersion: 'grammar/1',
  findings: [],
  cacheKey: 'key-g1',
  createdAt: 1,
};

function aids(overrides: Partial<SentenceAids> = {}): SentenceAids {
  return { ...NO_AIDS, ...overrides };
}

function labels(actions: readonly { readonly label: string }[]): string[] {
  return actions.map((action) => action.label);
}

describe('sentenceMenuActions', () => {
  it('offers translation and analysis for an imported sentence with neither', () => {
    expect(labels(sentenceMenuActions(aids(), 'imported'))).toEqual([
      'Translate sentence',
      'Analyze grammar',
      'Sentence details',
    ]);
  });

  it('offers no grammar entry for a generated story', () => {
    const actions = sentenceMenuActions(aids(), 'generated');

    expect(actions.some((action) => action.id === 'analyze-grammar')).toBe(false);
  });

  it('offers hiding a visible translation and showing a hidden one', () => {
    const visible = sentenceMenuActions(
      aids({ translation: TRANSLATION, translationVisible: true }),
      'imported',
    );
    const hidden = sentenceMenuActions(
      aids({ translation: TRANSLATION, translationVisible: false }),
      'imported',
    );

    expect(labels(visible)).toContain('Hide translation');
    expect(labels(hidden)).toContain('Show translation');
    // Already translated, so it is never offered again.
    expect(labels(visible)).not.toContain('Translate sentence');
  });

  it('offers a retry after a failure', () => {
    const actions = sentenceMenuActions(
      aids({
        translationAction: { state: 'failed', error: null },
        grammarAction: { state: 'failed', error: null },
      }),
      'imported',
    );

    expect(labels(actions)).toContain('Retry translation');
    expect(labels(actions)).toContain('Retry grammar analysis');
  });

  it('shows a running action as busy rather than offering it again', () => {
    const actions = sentenceMenuActions(
      aids({ translationAction: { state: 'running', error: null } }),
      'imported',
    );
    const translate = actions.find((action) => action.id === 'translate');

    expect(translate?.label).toBe('Translating…');
    expect(translate?.busy).toBe(true);
  });

  it('offers re-analysis only while an analysis is stale', () => {
    const current = sentenceMenuActions(
      aids({ grammar: GRAMMAR, grammarAction: IDLE_ACTION }),
      'imported',
    );
    const stale = sentenceMenuActions(aids({ grammar: GRAMMAR, grammarStale: true }), 'imported');

    expect(labels(current)).not.toContain('Re-analyze grammar');
    expect(labels(stale)).toContain('Re-analyze grammar');
  });

  it('always ends with sentence details', () => {
    const actions = sentenceMenuActions(aids({ translation: TRANSLATION }), 'imported');

    expect(actions.at(-1)?.id).toBe('details');
  });
});
