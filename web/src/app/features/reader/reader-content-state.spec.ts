import { describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { aiError } from '../../domain/ai/ai-error';
import { readerContentState } from './reader-content-state';

const ID = readingId('018f0000-0000-7000-8000-000000000001');
const READING: Reading = {
  id: ID,
  kind: 'imported',
  importSource: 'paste',
  sourceTextHash: 'hash',
  title: 'A story',
  createdAt: 0,
  updatedAt: 0,
  lastOpenedAt: null,
  sentenceCount: 4,
  characterCount: 20,
  excerpt: '猫です。',
  translationSummary: { total: 4, completed: 0, failed: 0 },
  audioSummary: { total: 4, completed: 0, failed: 0 },
  grammarSummary: { state: 'not-requested' },
  preparationTargets: ['english'],
  analyzerVersion: '1',
};
const IDLE = { kind: 'idle' } as const;
const COUNTS = { total: 4, requested: 3, completed: 1, failed: 0 };

describe('reader content state', () => {
  it.each([
    ['english', 'Translate story'],
    ['grammar', 'Add notes'],
  ] as const)('offers an explicit action for absent %s content', (layer, label) => {
    expect(readerContentState(READING, layer, IDLE, 'ready', true)).toMatchObject({
      action: 'prepare',
      label,
      status: 'Not added',
      disabled: false,
    });
  });

  it('does not confuse a standing target with saved content', () => {
    expect(readerContentState(READING, 'english', IDLE, 'ready', true).label).toBe(
      'Translate story',
    );
  });

  it('counts content saved before and during a running job', () => {
    expect(
      readerContentState(
        READING,
        'english',
        { kind: 'running', readingId: ID, counts: COUNTS },
        'ready',
        true,
      ),
    ).toMatchObject({
      status: '2 of 4 sentences saved',
      action: 'cancel',
      label: 'Stop',
      busy: true,
    });
  });

  it('lets the learner stop queued work while offline', () => {
    expect(
      readerContentState(READING, 'grammar', { kind: 'queued', readingId: ID }, 'ready', false),
    ).toMatchObject({
      status: 'Waiting for connection',
      action: 'cancel',
      disabled: false,
    });
  });

  it('continues a stopped job without presenting it as complete', () => {
    expect(
      readerContentState(
        READING,
        'english',
        { kind: 'cancelled', readingId: ID, counts: COUNTS },
        'ready',
        true,
      ),
    ).toMatchObject({
      status: '2 of 4 sentences saved · Stopped',
      action: 'prepare',
      label: 'Continue',
    });
  });

  it('reports a storage failure and disables an offline retry', () => {
    expect(
      readerContentState(
        READING,
        'english',
        {
          kind: 'failed',
          readingId: ID,
          counts: COUNTS,
          canRetry: true,
          error: { source: 'storage', error: storageError('unavailable', 'Storage unavailable') },
        },
        'ready',
        false,
      ),
    ).toMatchObject({
      label: 'Retry remaining',
      disabled: true,
      error: 'Saving failed: Storage unavailable',
    });
  });

  it('says a finished layer is ready rather than counting a full set twice', () => {
    expect(
      readerContentState(
        { ...READING, translationSummary: { total: 4, completed: 4, failed: 0 } },
        'english',
        IDLE,
        'ready',
        true,
      ).status,
    ).toBe('Ready');
  });

  it('reads analyzed grammar offline without requiring a model', () => {
    expect(
      readerContentState(
        { ...READING, grammarSummary: { state: 'complete', concernCount: 0 } },
        'grammar',
        IDLE,
        'incomplete',
        false,
      ),
    ).toMatchObject({
      status: 'Ready',
      action: null,
      label: '',
    });
  });

  it('continues partially saved grammar after a reload', () => {
    expect(
      readerContentState(
        {
          ...READING,
          grammarSummary: { state: 'partial', analyzedSentenceCount: 2, concernCount: 0 },
        },
        'grammar',
        IDLE,
        'ready',
        true,
      ),
    ).toMatchObject({
      label: 'Continue',
      status: '2 of 4 sentences analyzed',
    });
  });

  it('reports voice configuration without repeating the transport link', () => {
    expect(readerContentState(READING, 'audio', IDLE, 'untested', true)).toMatchObject({
      status: 'Test your voice.',
      action: null,
      label: '',
    });
  });

  it('does not claim an empty reading is ready', () => {
    expect(
      readerContentState({ ...READING, sentenceCount: 0 }, 'english', IDLE, 'ready', true),
    ).toMatchObject({
      status: 'No sentences',
      action: null,
      label: '',
    });
  });

  it.each(['queued', 'preparing', 'paused'] as const)('keeps %s work stoppable', (kind) => {
    const state = readerContentState(
      READING,
      'english',
      { kind, readingId: ID, counts: COUNTS },
      'ready',
      true,
    );
    expect(state).toMatchObject({ action: 'cancel', busy: true, disabled: false });
    expect(state.status).toBe(kind === 'preparing' ? 'Preparing…' : 'Waiting to continue');
  });

  it.each([
    ['absent', IDLE],
    ['deleted', { kind: 'deleted', readingId: ID }],
    ['running', { kind: 'running', readingId: ID, counts: COUNTS }],
    ['stopped', { kind: 'cancelled', readingId: ID, counts: COUNTS }],
  ] as const)(
    'leaves %s audio to the transport rather than offering it twice',
    (_name, progress) => {
      expect(readerContentState(READING, 'audio', progress, 'ready', true)).toMatchObject({
        action: null,
        label: '',
        disabled: false,
      });
    },
  );

  it('still reports what a stopped audio run managed', () => {
    expect(
      readerContentState(
        READING,
        'audio',
        { kind: 'cancelled', readingId: ID, counts: COUNTS },
        'ready',
        true,
      ).status,
    ).toBe('2 of 4 sentences saved · Stopped');
  });

  it('counts a completed run before the stored summary refresh arrives', () => {
    expect(
      readerContentState(
        READING,
        'english',
        {
          kind: 'complete',
          readingId: ID,
          counts: { total: 4, requested: 2, completed: 2, failed: 0 },
        },
        'ready',
        true,
      ).label,
    ).toBe('');
  });

  it('shows provider errors and directs a non-retryable failure to settings', () => {
    const state = readerContentState(
      READING,
      'grammar',
      {
        kind: 'failed',
        readingId: ID,
        counts: COUNTS,
        canRetry: false,
        error: { source: 'provider', error: aiError('unknown', 'translation', 'Unavailable') },
      },
      'ready',
      true,
    );
    expect(state.action).toBe('settings');
    expect(state.error).toBeTruthy();
  });

  it('checks changed settings before continuing stopped work', () => {
    expect(
      readerContentState(
        READING,
        'english',
        { kind: 'cancelled', readingId: ID, counts: COUNTS },
        'stale',
        true,
      ),
    ).toMatchObject({ action: 'settings', label: 'Check settings' });
  });

  it('disables a new request offline', () => {
    expect(readerContentState(READING, 'english', IDLE, 'ready', false)).toMatchObject({
      status: 'Not added · Offline',
      disabled: true,
    });
  });

  it('offers retry for stored grammar failure after a reload', () => {
    expect(
      readerContentState(
        { ...READING, grammarSummary: { state: 'unavailable', reasonCode: 'provider' } },
        'grammar',
        IDLE,
        'ready',
        true,
      ),
    ).toMatchObject({ status: 'Could not finish', label: 'Retry remaining' });
  });

  it('reports the grammar request phase before the first batch returns', () => {
    expect(
      readerContentState(
        READING,
        'grammar',
        {
          kind: 'running',
          readingId: ID,
          counts: { total: 4, requested: 4, completed: 0, failed: 0 },
          phase: 'requesting',
        },
        'ready',
        true,
      ),
    ).toMatchObject({ status: 'Analyzing…', busy: true, action: 'cancel' });
  });

  it('reports the grammar save phase before the first batch is counted', () => {
    expect(
      readerContentState(
        READING,
        'grammar',
        {
          kind: 'running',
          readingId: ID,
          counts: { total: 4, requested: 4, completed: 0, failed: 0 },
          phase: 'saving',
        },
        'ready',
        true,
      ),
    ).toMatchObject({ status: 'Working…', busy: true, action: 'cancel' });
  });
});
