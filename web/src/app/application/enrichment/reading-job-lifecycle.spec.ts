import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetJob } from '../../domain/enrichment/jobs';
import { fixedClock } from '../../domain/shared/clock';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { err } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import { DexieReadingRepository } from '../../infrastructure/persistence/repositories/dexie-reading.repository';
import { importedReadingFixture, uuid } from '../../../testing/persistence-fixtures';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { NOOP_LOGGER } from '../shared/diagnostics';
import {
  ReadingJobLifecycle,
  countsFor,
  type PlanOutcome,
  type ReadingJobRun,
} from './reading-job-lifecycle';

const NOW = 1_700_600_000_000;

interface Context {
  readonly total: number;
}

/** A promise the spec settles, so a run can be held at an exact point. */
function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

interface Bed {
  readonly db: MonosaiDatabase;
  readonly jobs: DexieJobRepository;
  readonly lifecycle: ReadingJobLifecycle<Context>;
  readonly reading: ReadingId;
  readonly other: ReadingId;
  /** Held before the plan resolves, while the run is `preparing`. */
  planGate: Promise<void> | null;
  /** Held inside `process`, after the run has published `running`. */
  processGate: Promise<void> | null;
  /** The three sentences every row covers, in reading order. */
  readonly sentenceIds: readonly SentenceId[];
  /** When set, planning finds the row already reconciled to `complete`. */
  planDrained: boolean;
  /** What a run does with its row before it settles. */
  work: ((job: AssetJob) => Promise<void>) | null;
  plans: number;
  processed: number;
}

async function configure(): Promise<Bed> {
  const db = await createTestDatabase();
  const clock = fixedClock(NOW);
  const jobs = new DexieJobRepository(db, clock);
  const readings = new DexieReadingRepository(db, clock);
  const draft = importedReadingFixture({ seed: 1 });
  const other = importedReadingFixture({ seed: 2 });
  await readings.saveImportedReading(draft);
  await readings.saveImportedReading(other);
  let created = 0;

  const plan = async (readingId: ReadingId): Promise<PlanOutcome<Context>> => {
    bed.plans += 1;
    if (bed.planGate !== null) await bed.planGate;
    const active = await jobs.findActive(readingId, 'translate-reading');
    if (!active.ok)
      return { kind: 'unavailable', error: { source: 'storage', error: active.error } };
    if (active.value !== null) return { kind: 'planned', context: { total: 3 }, job: active.value };
    created += 1;
    const ids = draft.sentences.slice(0, 3).map((sentence) => sentence.id);
    const job: AssetJob = {
      id: jobId(uuid(8800 + created)),
      kind: 'translate-reading',
      readingId,
      state: bed.planDrained ? 'complete' : 'running',
      orderedSentenceIds: ids,
      completedSentenceIds: bed.planDrained ? ids : [],
      failedItems: [],
      configFingerprint: 'fingerprint',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const stored = await jobs.create(job);
    return stored.ok
      ? { kind: 'planned', context: { total: 3 }, job: stored.value }
      : { kind: 'unavailable', error: { source: 'storage', error: stored.error } };
  };

  const process = async (context: Context, job: AssetJob, run: ReadingJobRun): Promise<void> => {
    bed.processed += 1;
    const counts = countsFor(context.total, job);
    bed.lifecycle.publish({ kind: 'running', readingId: job.readingId, counts });
    if (bed.processGate !== null) await bed.processGate;
    if (bed.work !== null) await bed.work(job);
    await bed.lifecycle.settle(job, counts, run, null);
  };

  const bed: Bed = {
    db,
    jobs,
    lifecycle: new ReadingJobLifecycle<Context>({
      jobKind: 'translate-reading',
      task: 'translation',
      logKind: 'translation',
      jobs,
      logger: NOOP_LOGGER,
      failure: {},
      plan,
      process,
    }),
    reading: draft.reading.id,
    other: other.reading.id,
    sentenceIds: draft.sentences.slice(0, 3).map((sentence) => sentence.id),
    planDrained: false,
    work: null,
    planGate: null,
    processGate: null,
    plans: 0,
    processed: 0,
  };
  return bed;
}

async function rowStates(db: MonosaiDatabase): Promise<readonly string[]> {
  return (await db.assetJobs.toArray()).map((row) => row.state);
}

describe('ReadingJobLifecycle', () => {
  let bed: Bed;

  beforeEach(async () => {
    bed = await configure();
  });

  afterEach(async () => {
    await destroyTestDatabase(bed.db);
    vi.restoreAllMocks();
  });

  it('joins a run already in flight rather than starting a second', async () => {
    const held = gate();
    bed.processGate = held.opened;

    const first = bed.lifecycle.start(bed.reading);
    const second = bed.lifecycle.start(bed.reading);
    await vi.waitFor(() => {
      expect(bed.lifecycle.progress().kind).toBe('running');
    });
    held.open();
    await Promise.all([first, second]);

    expect(bed.plans).toBe(1);
    expect(bed.processed).toBe(1);
    expect(bed.lifecycle.progress().kind).toBe('complete');
    expect(await rowStates(bed.db)).toEqual(['complete']);
  });

  it('closes the row without processing it when stopped while preparing', async () => {
    const held = gate();
    bed.planGate = held.opened;

    const run = bed.lifecycle.start(bed.reading);
    expect(bed.lifecycle.progress().kind).toBe('preparing');
    bed.lifecycle.cancel(bed.reading);
    expect(bed.lifecycle.progress().kind).toBe('preparing');
    held.open();
    await run;

    expect(bed.processed).toBe(0);
    expect(bed.lifecycle.progress().kind).toBe('cancelled');
    expect(await rowStates(bed.db)).toEqual(['cancelled']);
  });

  it('reports a stopped run as running until it has unwound and its row is closed', async () => {
    const held = gate();
    bed.processGate = held.opened;

    const run = bed.lifecycle.start(bed.reading);
    await vi.waitFor(() => {
      expect(bed.lifecycle.progress().kind).toBe('running');
    });
    bed.lifecycle.cancel(bed.reading);

    expect(bed.lifecycle.progress().kind).toBe('running');
    expect(bed.lifecycle.isRunningFor(bed.reading)).toBe(true);
    held.open();
    await run;

    expect(bed.lifecycle.progress().kind).toBe('cancelled');
    expect(await rowStates(bed.db)).toEqual(['cancelled']);
  });

  it('reports a cancellation that could not be saved instead of claiming the run stopped', async () => {
    const held = gate();
    bed.processGate = held.opened;
    vi.spyOn(bed.jobs, 'setState').mockResolvedValueOnce(
      err(storageError('unavailable', 'The database was unavailable.')),
    );

    const run = bed.lifecycle.start(bed.reading);
    await vi.waitFor(() => {
      expect(bed.lifecycle.progress().kind).toBe('running');
    });
    bed.lifecycle.cancel(bed.reading);
    held.open();
    await run;

    expect(bed.lifecycle.progress()).toMatchObject({
      kind: 'failed',
      error: { source: 'storage' },
    });
  });

  it('ignores a stop pressed on a different reading', async () => {
    const held = gate();
    bed.processGate = held.opened;

    const run = bed.lifecycle.start(bed.reading);
    await vi.waitFor(() => {
      expect(bed.lifecycle.progress().kind).toBe('running');
    });
    bed.lifecycle.cancel(bed.other);
    held.open();
    await run;

    expect(bed.lifecycle.progress().kind).toBe('complete');
  });

  it('finalizes a running run before its reading is deleted', async () => {
    const held = gate();
    bed.processGate = held.opened;

    const run = bed.lifecycle.start(bed.reading);
    await vi.waitFor(() => {
      expect(bed.lifecycle.progress().kind).toBe('running');
    });
    let deleted = false;
    const deletion = bed.lifecycle.readingDeleted(bed.reading).then(() => {
      deleted = true;
    });
    await Promise.resolve();
    expect(deleted).toBe(false);
    held.open();
    await Promise.all([run, deletion]);

    expect(bed.lifecycle.progress().kind).toBe('deleted');
    expect(bed.lifecycle.progressFor(bed.other).kind).toBe('idle');
    expect(await rowStates(bed.db)).toEqual(['cancelled']);
  });

  it('finishes a row planning found complete, whatever was pressed meanwhile', async () => {
    bed.planDrained = true;
    const held = gate();
    bed.planGate = held.opened;

    const run = bed.lifecycle.start(bed.reading);
    bed.lifecycle.yieldAfterBatch();
    bed.lifecycle.cancel(bed.reading);
    held.open();
    await run;

    // Nothing was left to stop, so a finished layer never reads "Stopped".
    expect(bed.processed).toBe(0);
    expect(bed.lifecycle.progress().kind).toBe('complete');
    expect(await rowStates(bed.db)).toEqual(['complete']);
  });

  describe('a hole left before a yield', () => {
    /** Fails the first sentence, then parks, as a lane handing over would. */
    async function failThenPark(errorCode: string): Promise<void> {
      bed.work = async (job) => {
        await bed.jobs.recordFailure(job.id, {
          sentenceId: bed.sentenceIds[0],
          errorCode,
          failedAt: NOW,
        });
        bed.lifecycle.yieldAfterBatch();
      };
      await bed.lifecycle.start(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('paused');
    }

    it('still fails the job once the resumed run stores everything else', async () => {
      await failThenPark('rate-limited');
      bed.work = async (job) => {
        for (const sentenceId of bed.sentenceIds.slice(1)) {
          await bed.jobs.recordCompletion(job.id, sentenceId);
        }
      };

      await bed.lifecycle.resume(bed.reading);

      // The same ending an uninterrupted run with that failure has.
      expect(bed.lifecycle.progress()).toMatchObject({
        kind: 'failed',
        error: { source: 'provider', error: { code: 'rate-limited', task: 'translation' } },
      });
      expect(await rowStates(bed.db)).toEqual(['failed']);
    });

    it('fails a resumed row with nothing left to request, without requesting it again', async () => {
      await failThenPark('not-a-code');
      const [, ...rest] = bed.sentenceIds;
      const row = (await bed.db.assetJobs.toArray())[0];
      await bed.db.assetJobs.update(row.id, { completedSentenceIds: rest });

      await bed.lifecycle.resume(bed.reading);

      expect(bed.processed).toBe(1);
      // A stored code is checked, not trusted.
      expect(bed.lifecycle.progress()).toMatchObject({
        kind: 'failed',
        error: { source: 'provider', error: { code: 'unknown' } },
      });
      expect(await rowStates(bed.db)).toEqual(['failed']);
    });
  });

  describe('resume', () => {
    it('does nothing, and plans nothing, when there is no unfinished row', async () => {
      await bed.lifecycle.resume(bed.reading);

      expect(bed.plans).toBe(0);
      expect(bed.lifecycle.progress().kind).toBe('idle');
    });

    it('puts away a stale report once its row has gone', async () => {
      await bed.lifecycle.start(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('complete');

      await bed.lifecycle.resume(bed.reading);

      expect(bed.plans).toBe(1);
      expect(bed.lifecycle.progress().kind).toBe('idle');
    });

    it('continues an unfinished row', async () => {
      const held = gate();
      bed.processGate = held.opened;
      const parked = bed.lifecycle.start(bed.reading);
      await vi.waitFor(() => {
        expect(bed.lifecycle.progress().kind).toBe('running');
      });
      bed.lifecycle.yieldAfterBatch();
      held.open();
      await parked;
      expect(await rowStates(bed.db)).toEqual(['paused']);
      bed.processGate = null;

      await bed.lifecycle.resume(bed.reading);

      expect(bed.plans).toBe(2);
      expect(bed.lifecycle.progress().kind).toBe('complete');
      expect(await rowStates(bed.db)).toEqual(['complete']);
    });

    it('does nothing while a run is already working', async () => {
      const held = gate();
      bed.processGate = held.opened;
      const run = bed.lifecycle.start(bed.reading);
      await vi.waitFor(() => {
        expect(bed.lifecycle.progress().kind).toBe('running');
      });

      await bed.lifecycle.resume(bed.reading);
      held.open();
      await run;

      expect(bed.plans).toBe(1);
    });
  });

  describe('acknowledge', () => {
    it('returns a settled report to rest', async () => {
      await bed.lifecycle.start(bed.reading);

      bed.lifecycle.acknowledge(bed.other);
      expect(bed.lifecycle.progress().kind).toBe('complete');
      bed.lifecycle.acknowledge(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('idle');
    });

    it('never hides a run that is still going', async () => {
      const held = gate();
      bed.processGate = held.opened;
      const run = bed.lifecycle.start(bed.reading);
      await vi.waitFor(() => {
        expect(bed.lifecycle.progress().kind).toBe('running');
      });

      bed.lifecycle.acknowledge(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('running');
      held.open();
      await run;
    });
  });

  describe('yielding', () => {
    async function park(): Promise<void> {
      const held = gate();
      bed.processGate = held.opened;
      const run = bed.lifecycle.start(bed.reading);
      await vi.waitFor(() => {
        expect(bed.lifecycle.progress().kind).toBe('running');
      });
      bed.lifecycle.yieldAfterBatch();
      expect(bed.lifecycle.yieldRequested).toBe(true);
      held.open();
      await run;
      bed.processGate = null;
    }

    it('parks a working run at its boundary, resumable and still in progress', async () => {
      await park();

      expect(bed.lifecycle.progress().kind).toBe('paused');
      expect(bed.lifecycle.yieldRequested).toBe(false);
      expect(bed.lifecycle.isRunning()).toBe(false);
      expect(bed.lifecycle.isRunningFor(bed.reading)).toBe(true);
      expect(await rowStates(bed.db)).toEqual(['paused']);
      bed.lifecycle.acknowledge(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('paused');
    });

    it('is ignored when nothing is working', () => {
      bed.lifecycle.yieldAfterBatch();

      expect(bed.lifecycle.yieldRequested).toBe(false);
    });

    it('parks a run asked to yield while it was still preparing, before any work', async () => {
      const held = gate();
      bed.planGate = held.opened;
      const run = bed.lifecycle.start(bed.reading);
      bed.lifecycle.yieldAfterBatch();
      held.open();
      await run;

      expect(bed.processed).toBe(0);
      expect(bed.lifecycle.progress().kind).toBe('paused');
      expect(await rowStates(bed.db)).toEqual(['paused']);
    });

    it('is outranked by a stop pressed after it', async () => {
      const held = gate();
      bed.processGate = held.opened;
      const run = bed.lifecycle.start(bed.reading);
      await vi.waitFor(() => {
        expect(bed.lifecycle.progress().kind).toBe('running');
      });
      bed.lifecycle.yieldAfterBatch();
      bed.lifecycle.cancel(bed.reading);
      held.open();
      await run;

      expect(bed.lifecycle.progress().kind).toBe('cancelled');
      expect(await rowStates(bed.db)).toEqual(['cancelled']);
    });

    it('closes a parked run on stop, and reports it once the row is closed', async () => {
      await park();

      bed.lifecycle.cancel(bed.reading);
      expect(bed.lifecycle.progress().kind).toBe('paused');
      await bed.lifecycle.cancelAndWait(bed.reading);

      expect(bed.lifecycle.progress().kind).toBe('cancelled');
      expect(await rowStates(bed.db)).toEqual(['cancelled']);
    });

    it('reports a parked row whose close threw, rather than leaving it unhandled', async () => {
      await park();
      vi.spyOn(bed.jobs, 'findActive').mockRejectedValueOnce(new Error('boom'));

      await bed.lifecycle.cancelAndWait(bed.reading);

      expect(bed.lifecycle.progress()).toMatchObject({
        kind: 'failed',
        error: { source: 'storage', error: { code: 'unknown', cause: 'Error' } },
      });
    });

    it('lets a start after a stop wait for the parked row to close', async () => {
      await park();

      bed.lifecycle.cancel(bed.reading);
      await bed.lifecycle.start(bed.reading);

      // The stopped row stays stopped; the new run is a row of its own.
      const rows = await bed.db.assetJobs.toArray();
      expect(rows.map((row) => row.state).sort()).toEqual(['cancelled', 'complete']);
      expect(bed.lifecycle.progress().kind).toBe('complete');
    });
  });
});
