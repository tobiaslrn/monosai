import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { readingId, type ReadingId } from '../../domain/shared/ids';
import { uuid } from '../../../testing/persistence-fixtures';
import { AudioJobStore } from './audio-job.store';
import { GrammarJobStore } from './grammar-job.store';
import { TranslationJobStore } from './translation-job.store';
import { LayerRunners } from './layer-runner';

const READING = readingId(uuid(9101));

const COUNTS = { total: 2, requested: 2, completed: 1, failed: 1 };

/** Records what the lane asked for, and reports whatever the spec sets. */
class RecordingStore {
  readonly calls: string[] = [];
  progress: unknown = { kind: 'idle' };

  enqueue(readingId: ReadingId) {
    this.calls.push(`enqueue:${readingId}`);
    return Promise.resolve({ kind: 'queued' as const });
  }
  start(readingId: ReadingId) {
    this.calls.push(`start:${readingId}`);
    return Promise.resolve();
  }
  resume(readingId: ReadingId) {
    this.calls.push(`resume:${readingId}`);
    return Promise.resolve();
  }
  retry(readingId: ReadingId) {
    this.calls.push(`retry:${readingId}`);
    return Promise.resolve();
  }
  yieldAfterBatch() {
    this.calls.push('yield');
  }
  cancel(readingId: ReadingId) {
    this.calls.push(`cancel:${readingId}`);
  }
  cancelAndWait(readingId: ReadingId) {
    this.calls.push(`cancelAndWait:${readingId}`);
    return Promise.resolve();
  }
  acknowledge(readingId: ReadingId) {
    this.calls.push(`acknowledge:${readingId}`);
  }
  readingDeleted(readingId: ReadingId) {
    this.calls.push(`deleted:${readingId}`);
    return Promise.resolve();
  }
  progressFor(readingId: ReadingId) {
    this.calls.push(`progressFor:${readingId}`);
    return this.progress as never;
  }
  isRunning() {
    return false;
  }
}

describe('LayerRunners', () => {
  let stores: Record<PreparationLayer, RecordingStore>;
  let runners: LayerRunners;

  beforeEach(() => {
    TestBed.resetTestingModule();
    stores = {
      english: new RecordingStore(),
      grammar: new RecordingStore(),
      audio: new RecordingStore(),
    };
    TestBed.configureTestingModule({
      providers: [
        LayerRunners,
        { provide: TranslationJobStore, useValue: stores.english },
        { provide: GrammarJobStore, useValue: stores.grammar },
        { provide: AudioJobStore, useValue: stores.audio },
      ],
    });
    runners = TestBed.inject(LayerRunners);
  });

  it('names the layer each producer fills in', () => {
    expect(runners.all().map((runner) => runner.layer)).toEqual(['english', 'grammar', 'audio']);
    expect(runners.runnerFor('grammar').layer).toBe('grammar');
  });

  it('passes every request through to the producer that owns the layer', async () => {
    const runner = runners.runnerFor('english');

    await runner.enqueue(READING);
    await runner.start(READING);
    await runner.resume(READING);
    await runner.retry(READING);
    runner.yieldAfterBatch();
    runner.cancel(READING);
    await runner.cancelAndWait(READING);
    runner.acknowledge(READING);
    await runner.readingDeleted(READING);
    runner.progressFor(READING);
    runner.isRunning();

    expect(stores.english.calls).toEqual([
      `enqueue:${READING}`,
      `start:${READING}`,
      `resume:${READING}`,
      `retry:${READING}`,
      'yield',
      `cancel:${READING}`,
      `cancelAndWait:${READING}`,
      `acknowledge:${READING}`,
      `deleted:${READING}`,
      `progressFor:${READING}`,
    ]);
    expect(stores.grammar.calls).toEqual([]);
    expect(stores.audio.calls).toEqual([]);
  });

  /**
   * A translation or a grammar analysis has no question to answer about whether
   * trying again could work, so the lane must not read their silence as "do not
   * offer a retry".
   */
  it('treats a failure with nothing to say about retrying as retryable', () => {
    stores.english.progress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: { source: 'provider', error: aiError('timeout', 'translation', 'It timed out.') },
    };

    const progress = runners.runnerFor('english').progressFor(READING);

    expect(progress.kind === 'failed' && progress.canRetry).toBe(true);
  });

  it('keeps the answer audio already has', () => {
    stores.audio.progress = {
      kind: 'failed',
      readingId: READING,
      counts: COUNTS,
      error: { source: 'provider', error: aiError('audio-invalid', 'tts-synthesis', 'Not audio.') },
      canRetry: false,
    };

    const progress = runners.runnerFor('audio').progressFor(READING);

    expect(progress.kind === 'failed' && progress.canRetry).toBe(false);
  });

  it('passes everything that is not a failure through unchanged', () => {
    stores.grammar.progress = { kind: 'running', readingId: READING, counts: COUNTS };

    expect(runners.runnerFor('grammar').progressFor(READING)).toEqual({
      kind: 'running',
      readingId: READING,
      counts: COUNTS,
    });
  });
});
