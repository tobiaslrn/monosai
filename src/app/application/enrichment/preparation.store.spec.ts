import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { aiError } from '../../domain/ai/ai-error';
import { jobKindFor, type PreparationLayer } from '../../domain/enrichment/preparation';
import type { Reading } from '../../domain/reading/reading';
import { fixedClock } from '../../domain/shared/clock';
import { jobId, readingId, sentenceId, type ReadingId } from '../../domain/shared/ids';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { uuid } from '../../../testing/persistence-fixtures';
import { GenerationActivityRegistry } from '../generation/generation-activity.registry';
import { AppUpdateStore, type AppUpdateStatus } from '../pwa/app-update.store';
import { CLOCK, ID_GENERATOR, JOB_REPOSITORY } from '../shared/repository-tokens';
import { LayerRunners, type LayerRunner } from './layer-runner';
import { IDLE_LAYER_PROGRESS, type LayerProgress } from './layer-progress';
import { PreparationStore } from './preparation.store';

const NOW = 1_700_800_000_000;
const FIRST = readingId(uuid(9001));
const SECOND = readingId(uuid(9002));

/**
 * One layer's producer, reduced to what the lane sequences.
 *
 * It records every call and finishes the row it was asked about, so the lane's
 * own loop — refresh, pick, claim, run, release — is exercised against real job
 * rows rather than against a promise that resolves to nothing.
 */
class FakeRunner implements LayerRunner {
  readonly started: ReadingId[] = [];
  readonly cancelled: ReadingId[] = [];
  readonly enqueued: ReadingId[] = [];
  yields = 0;
  /** Set to stop finishing rows and report a failure instead. */
  failOn: ReadingId | null = null;
  /** Set to park instead of finishing, as a preempted run does. */
  pauseOn: ReadingId | null = null;

  private progress: LayerProgress = IDLE_LAYER_PROGRESS;
  private gate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;
  private announceStart: (() => void) | null = null;
  private started_: Promise<void> | null = null;

  /**
   * Keeps the next run in flight until it is released, so a spec can do to the
   * lane what a learner does: act while a batch is actually running.
   */
  holdOpen(): { readonly started: Promise<void>; readonly release: () => void } {
    this.gate = new Promise<void>((resolve) => {
      this.openGate = resolve;
    });
    this.started_ = new Promise<void>((resolve) => {
      this.announceStart = resolve;
    });
    return {
      started: this.started_,
      release: () => this.openGate?.(),
    };
  }

  constructor(
    readonly layer: PreparationLayer,
    private readonly jobs: DexieJobRepository,
  ) {}

  enqueue(readingId: ReadingId) {
    this.enqueued.push(readingId);
    return Promise.resolve({ kind: 'queued' as const });
  }

  async start(readingId: ReadingId): Promise<void> {
    this.started.push(readingId);
    const counts = { total: 1, requested: 1, completed: 0, failed: 0 };
    if (this.gate !== null) {
      const waiting = this.gate;
      this.gate = null;
      this.progress = { kind: 'running', readingId, counts };
      this.announceStart?.();
      await waiting;
    }
    if (this.failOn === readingId) {
      await this.close(readingId, 'failed');
      this.progress = {
        kind: 'failed',
        readingId,
        counts,
        error: { source: 'provider', error: aiError('unknown', 'translation', 'nope') },
        canRetry: true,
      };
      return;
    }
    if (this.pauseOn === readingId) {
      await this.close(readingId, 'paused');
      this.progress = { kind: 'paused', readingId, counts };
      return;
    }
    await this.close(readingId, 'complete');
    this.progress = { kind: 'complete', readingId, counts: { ...counts, completed: 1 } };
  }

  resume(readingId: ReadingId) {
    return this.start(readingId);
  }

  retry(readingId: ReadingId) {
    return this.start(readingId);
  }

  yieldAfterBatch(): void {
    this.yields += 1;
  }

  cancel(readingId: ReadingId): void {
    this.cancelled.push(readingId);
  }

  cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    return Promise.resolve();
  }

  acknowledge(): void {
    this.progress = IDLE_LAYER_PROGRESS;
  }

  readingDeleted(): Promise<void> {
    return Promise.resolve();
  }

  progressFor(readingId: ReadingId): LayerProgress {
    return this.progress.kind !== 'idle' && this.progress.readingId === readingId
      ? this.progress
      : IDLE_LAYER_PROGRESS;
  }

  isRunning(): boolean {
    return this.progress.kind === 'running';
  }

  private async close(readingId: ReadingId, state: 'complete' | 'failed' | 'paused') {
    const row = await this.jobs.findActive(readingId, jobKindFor(this.layer));
    if (row.ok && row.value !== null) {
      await this.jobs.setState(row.value.id, state);
    }
  }
}

interface LaneTestBed {
  readonly db: MonosaiDatabase;
  readonly store: PreparationStore;
  readonly jobs: DexieJobRepository;
  readonly runners: Readonly<Record<PreparationLayer, FakeRunner>>;
  readonly online: WritableSignal<boolean>;
  readonly generations: WritableSignal<number>;
  readonly update: WritableSignal<AppUpdateStatus>;
}

async function configure(): Promise<LaneTestBed> {
  TestBed.resetTestingModule();
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const jobs = new DexieJobRepository(db, clock);
  const runners: Record<PreparationLayer, FakeRunner> = {
    english: new FakeRunner('english', jobs),
    grammar: new FakeRunner('grammar', jobs),
    audio: new FakeRunner('audio', jobs),
  };
  const online = signal(true);
  const generations = signal(0);
  const update = signal<AppUpdateStatus>({ kind: 'idle' });
  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      PreparationStore,
      { provide: JOB_REPOSITORY, useValue: jobs },
      { provide: CLOCK, useValue: clock },
      {
        provide: ID_GENERATOR,
        useValue: {
          nextId: () => {
            counter += 1;
            return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
          },
        },
      },
      {
        provide: LayerRunners,
        useValue: {
          runnerFor: (layer: PreparationLayer) => runners[layer],
          all: () => [runners.english, runners.grammar, runners.audio],
        },
      },
      { provide: NETWORK_STATUS, useValue: { isOnline: online } },
      { provide: GenerationActivityRegistry, useValue: { runningCount: generations } },
      { provide: AppUpdateStore, useValue: { status: update } },
    ],
  });

  return {
    db,
    store: TestBed.inject(PreparationStore),
    jobs,
    runners,
    online,
    generations,
    update,
  };
}

let beds: LaneTestBed;

let rowSeed = 40_000;

/**
 * A row the lane can actually work needs something outstanding, so every helper
 * row carries one sentence that nothing has completed.
 */
async function outstandingRow(
  jobs: DexieJobRepository,
  reading: ReadingId,
  layer: PreparationLayer,
  createdAt = NOW,
): Promise<void> {
  rowSeed += 1;
  const created = await jobs.create({
    id: jobId(uuid(rowSeed)),
    kind: jobKindFor(layer),
    readingId: reading,
    state: 'queued',
    orderedSentenceIds: [sentenceId(uuid(rowSeed + 500_000))],
    completedSentenceIds: [],
    failedItems: [],
    configFingerprint: `${layer}-fingerprint`,
    createdAt,
    updatedAt: createdAt,
  });
  expect(created.ok).toBe(true);
}

function reading(id: ReadingId, targets: readonly PreparationLayer[]): Reading {
  return {
    id,
    kind: 'imported',
    importSource: 'paste',
    sourceTextHash: 'h',
    title: 'A reading',
    createdAt: NOW,
    updatedAt: NOW,
    lastOpenedAt: null,
    sentenceCount: 1,
    characterCount: 10,
    excerpt: '猫。',
    translationSummary: { total: 1, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 1, completed: 0, failed: 0 },
    preparationTargets: targets,
    analyzerVersion: '1',
  };
}

describe('PreparationStore', () => {
  beforeEach(async () => {
    beds = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(beds.db);
  });

  describe('what starts work', () => {
    it('can stop grammar independently while English is still running', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 1);
      const gate = beds.runners.english.holdOpen();
      const run = beds.store.pump();
      await gate.started;
      expect(beds.store.progressFor(FIRST, 'english').kind).toBe('running');
      await beds.store.stopLayer(FIRST, 'grammar');
      gate.release();
      await run;
      expect(beds.runners.grammar.started).toEqual([FIRST]);
    });

    it('resumes the remaining layer after a pause at a layer boundary', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 1);
      const gate = beds.runners.english.holdOpen();
      const run = beds.store.pump();
      await gate.started;
      beds.store.pause();
      gate.release();
      await run;
      expect(beds.runners.grammar.started).toEqual([FIRST]);
      await beds.store.resume();
      expect(beds.runners.grammar.started).toEqual([FIRST]);
    });

    it('leaves the next layer queued when the connection drops during a run', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 1);
      const gate = beds.runners.english.holdOpen();
      const run = beds.store.pump();
      await gate.started;
      beds.online.set(false);
      gate.release();
      await run;
      expect(beds.runners.grammar.started).toEqual([FIRST]);
      expect(beds.store.progressFor(FIRST, 'grammar').kind).toBe('complete');
    });

    it('ends all producers when the entire reading is stopped', async () => {
      await beds.store.stop(FIRST);
      for (const layer of ['english', 'grammar', 'audio'] as const) {
        expect(beds.runners[layer].cancelled).toEqual([FIRST]);
      }
    });

    it('releases a running reading when it is deleted', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      const gate = beds.runners.english.holdOpen();
      const run = beds.store.pump();
      await gate.started;
      await beds.store.readingDeleted(FIRST);
      expect(beds.store.current()).toBeNull();
      gate.release();
      await run;
    });

    it('does not issue work when the queue cannot be read', async () => {
      vi.spyOn(beds.jobs, 'listActive').mockResolvedValueOnce(
        err(storageError('unavailable', 'Storage unavailable')),
      );
      await beds.store.pump();
      expect(beds.runners.english.started).toEqual([]);
    });

    it('steps aside if another tab claims a reading after the queue was read', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      vi.spyOn(beds.jobs, 'claimReading').mockResolvedValueOnce(
        err(storageError('conflict', 'Claimed elsewhere')),
      );
      await beds.store.pump();
      expect(beds.runners.english.started).toEqual([]);
    });

    it('reports a failed stop write and leaves the queued job intact', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      const failure = storageError('unavailable', 'Storage unavailable');
      vi.spyOn(beds.jobs, 'setState').mockResolvedValueOnce(err(failure));
      expect(await beds.store.stopLayer(FIRST, 'english')).toEqual(err(failure));
      const active = await beds.jobs.findActive(FIRST, 'translate-reading');
      expect(active.ok && active.value?.state).toBe('queued');
    });

    it('reports an unreadable queue without pretending cancellation was saved', async () => {
      const failure = storageError('unavailable', 'Storage unavailable');
      vi.spyOn(beds.jobs, 'findActive').mockResolvedValueOnce(err(failure));
      expect(await beds.store.stopLayer(FIRST, 'english')).toEqual(err(failure));
    });

    it('can stop a layer whose producer already finalized the job', async () => {
      expect((await beds.store.stopLayer(FIRST, 'english')).ok).toBe(true);
      expect(beds.runners.english.cancelled).toEqual([FIRST]);
    });
    it('stops one queued layer without cancelling other layers or readings', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 1);
      await outstandingRow(beds.jobs, SECOND, 'english', NOW + 2);

      const stopped = await beds.store.stopLayer(FIRST, 'english');

      expect(stopped.ok).toBe(true);
      const rows = await beds.jobs.listActive();
      expect(rows.ok && rows.value.map((row) => [row.readingId, row.kind]).sort()).toEqual(
        [
          [FIRST, 'analyze-reading'],
          [SECOND, 'translate-reading'],
        ].sort(),
      );
      await beds.store.pump();
      expect(beds.runners.english.started).toEqual([SECOND]);
      expect(beds.runners.grammar.started).toEqual([FIRST]);
    });

    it('starts nothing at all when no reading has a job row', async () => {
      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
      expect(beds.runners.grammar.started).toEqual([]);
      expect(beds.runners.audio.started).toEqual([]);
    });

    it('queues only the layers a reading declares', async () => {
      await beds.store.reconcile(reading(FIRST, ['english', 'audio']));

      expect(beds.runners.english.enqueued).toEqual([FIRST]);
      expect(beds.runners.audio.enqueued).toEqual([FIRST]);
      expect(beds.runners.grammar.enqueued).toEqual([]);
    });

    it('works one reading through its layers in order', async () => {
      await outstandingRow(beds.jobs, FIRST, 'audio', NOW + 3);
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 2);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([FIRST]);
      expect(beds.runners.grammar.started).toEqual([FIRST]);
      expect(beds.runners.audio.started).toEqual([FIRST]);
    });

    it('runs English and grammar together, then starts audio', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 2);
      await outstandingRow(beds.jobs, FIRST, 'audio', NOW + 3);
      const english = beds.runners.english.holdOpen();
      const grammar = beds.runners.grammar.holdOpen();

      const run = beds.store.pump();
      await Promise.all([english.started, grammar.started]);

      expect(beds.runners.audio.started).toEqual([]);
      english.release();
      grammar.release();
      await run;
      expect(beds.runners.audio.started).toEqual([FIRST]);
    });

    it('works the reading the learner has open before the rest', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, SECOND, 'english', NOW + 2);
      beds.store.setOpenReading(SECOND);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([SECOND, FIRST]);
    });
  });

  describe('stepping aside', () => {
    it('asks the running layer to yield when the learner opens another reading', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, SECOND, 'english', NOW + 2);
      const gate = beds.runners.english.holdOpen();
      beds.runners.english.pauseOn = FIRST;
      const draining = beds.store.pump();
      await gate.started;

      beds.store.setOpenReading(SECOND);
      gate.release();
      await draining;

      expect(beds.runners.english.yields).toBeGreaterThan(0);
      expect(beds.runners.english.cancelled).toEqual([]);
      expect(beds.runners.english.started).toEqual([FIRST, SECOND]);
    });

    it('never cancels a layer to make room, audio least of all', async () => {
      await outstandingRow(beds.jobs, FIRST, 'audio');
      const gate = beds.runners.audio.holdOpen();
      beds.runners.audio.pauseOn = FIRST;
      const draining = beds.store.pump();
      await gate.started;

      beds.store.setOpenReading(SECOND);
      beds.store.pause();
      gate.release();
      await draining;

      expect(beds.runners.audio.cancelled).toEqual([]);
      expect(beds.runners.audio.yields).toBeGreaterThan(0);
    });

    it('lets the sibling text layer finish when one of them parks', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 2);
      beds.runners.english.pauseOn = FIRST;

      await beds.store.pump();

      expect(beds.runners.grammar.started).toEqual([FIRST]);
    });
  });

  describe('what holds the lane', () => {
    it('waits for a story that is still being written', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.generations.set(1);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
      expect(beds.store.hold()).toBe('generation');
    });

    it('parks without failing anything while the connection is gone', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.online.set(false);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
      expect(beds.store.hold()).toBe('offline');
      const rows = await beds.jobs.listActive();
      expect(rows.ok && rows.value).toHaveLength(1);
    });

    it('lets an available update through rather than holding it up', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.update.set({ kind: 'available' });

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
      expect(beds.store.hold()).toBe('update');
    });

    it('picks the queue back up once the hold clears', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.online.set(false);
      await beds.store.pump();

      beds.online.set(true);
      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([FIRST]);
      expect(beds.store.hold()).toBeNull();
    });

    it('stays put while the learner has paused it', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.store.pause();

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
      expect(beds.store.isPaused()).toBe(true);
    });
  });

  describe('one pipeline per reading', () => {
    it('issues nothing for a reading another lane is still working', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      await beds.jobs.claimReading(FIRST, 'another-tab', NOW);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([]);
    });

    it('works a different reading while another lane holds the first', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, SECOND, 'english', NOW + 2);
      await beds.jobs.claimReading(FIRST, 'another-tab', NOW);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([SECOND]);
    });

    it('takes over a reading whose lane stopped saying it was there', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      await beds.jobs.claimReading(FIRST, 'a-closed-tab', NOW - 120_000);

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([FIRST]);
    });

    it('lets go of the reading once it is done with it', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');

      await beds.store.pump();

      const rows = await beds.db.assetJobs.toArray();
      expect(rows.every((row) => row.claim === undefined)).toBe(true);
    });
  });

  describe('a layer that refuses', () => {
    it('does not hand the lane the same refusal on every pass', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.runners.english.failOn = FIRST;

      await beds.store.pump();
      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([FIRST]);
    });

    it('runs it again when the learner asks', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.runners.english.failOn = FIRST;
      await beds.store.pump();

      beds.runners.english.failOn = null;
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 10);
      await beds.store.retry(FIRST, 'english');

      expect(beds.runners.english.started).toEqual([FIRST, FIRST]);
    });

    it('leaves the sibling text layer and the audio behind it untouched', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, FIRST, 'grammar', NOW + 2);
      await outstandingRow(beds.jobs, FIRST, 'audio', NOW + 3);
      beds.runners.english.failOn = FIRST;

      await beds.store.pump();

      expect(beds.store.progressFor(FIRST, 'english').kind).toBe('failed');
      expect(beds.runners.grammar.started).toEqual([FIRST]);
      expect(beds.runners.audio.started).toEqual([FIRST]);
    });

    it('keeps working the other readings', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english', NOW + 1);
      await outstandingRow(beds.jobs, SECOND, 'english', NOW + 2);
      beds.runners.english.failOn = FIRST;

      await beds.store.pump();

      expect(beds.runners.english.started).toEqual([FIRST, SECOND]);
    });
  });

  describe('reporting', () => {
    it('calls an outstanding layer queued before its turn comes', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.generations.set(1);
      await beds.store.pump();

      expect(beds.store.progressFor(FIRST, 'english').kind).toBe('queued');
      expect(beds.store.progressFor(FIRST, 'audio').kind).toBe('idle');
    });

    it('drops a deleted reading from the queue', async () => {
      await outstandingRow(beds.jobs, FIRST, 'english');
      beds.generations.set(1);
      await beds.store.pump();

      await beds.store.readingDeleted(FIRST);

      expect(beds.store.queue()).toEqual([]);
    });
  });
});
