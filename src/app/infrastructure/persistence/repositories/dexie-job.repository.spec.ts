import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { jobId } from '../../../domain/shared/ids';
import type { AssetJob } from '../../../domain/enrichment/jobs';
import { remainingSentenceIds } from '../../../domain/enrichment/jobs';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import { importedReadingFixture, uuid } from '../../../../testing/persistence-fixtures';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieJobRepository } from './dexie-job.repository';
import { DexieReadingRepository } from './dexie-reading.repository';

describe('DexieJobRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieJobRepository;
  let draft: ReturnType<typeof importedReadingFixture>;
  let job: AssetJob;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieJobRepository(db, fixedClock(1_700_600_000_000));
    draft = importedReadingFixture();
    await new DexieReadingRepository(db, fixedClock(1_700_600_000_000)).saveImportedReading(draft);

    job = {
      id: jobId(uuid(8100)),
      kind: 'translate-reading',
      readingId: draft.reading.id,
      state: 'running',
      orderedSentenceIds: draft.sentences.map((sentence) => sentence.id),
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: 'translate-fingerprint',
      createdAt: 1_700_600_000_000,
      updatedAt: 1_700_600_000_000,
    };
    await repository.create(job);
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('finds the active job for a reading and kind', async () => {
    const found = await repository.findActive(draft.reading.id, 'translate-reading');

    expect(found.ok && found.value?.id).toBe(job.id);
    expect((await repository.findActive(draft.reading.id, 'prepare-audio')).ok).toBe(true);
  });

  it('records completions idempotently', async () => {
    await repository.recordCompletion(job.id, draft.sentences[0].id);
    const second = await repository.recordCompletion(job.id, draft.sentences[0].id);

    expect(second.ok && second.value.completedSentenceIds).toEqual([draft.sentences[0].id]);
  });

  it('completes the job when every sentence succeeds', async () => {
    for (const sentence of draft.sentences) {
      await repository.recordCompletion(job.id, sentence.id);
    }

    const loaded = await repository.get(job.id);
    expect(loaded.ok && loaded.value?.state).toBe('complete');
  });

  it('records a failure and keeps the job open for retry', async () => {
    const failed = await repository.recordFailure(job.id, {
      sentenceId: draft.sentences[1].id,
      errorCode: 'provider-unavailable',
      failedAt: 1_700_600_100_000,
    });

    expect(failed.ok).toBe(true);
    if (!failed.ok) {
      return;
    }
    expect(failed.value.failedItems).toHaveLength(1);
    expect(failed.value.state).toBe('running');
    expect(remainingSentenceIds(failed.value)).toEqual([
      draft.sentences[0].id,
      draft.sentences[2].id,
    ]);
  });

  it('clears a previous failure when the sentence later succeeds', async () => {
    await repository.recordFailure(job.id, {
      sentenceId: draft.sentences[1].id,
      errorCode: 'timeout',
      failedAt: 1_700_600_100_000,
    });

    const completed = await repository.recordCompletion(job.id, draft.sentences[1].id);

    expect(completed.ok && completed.value.failedItems).toEqual([]);
  });

  it('keeps completed work when the job is cancelled', async () => {
    await repository.recordCompletion(job.id, draft.sentences[0].id);
    const cancelled = await repository.setState(job.id, 'cancelled');

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) {
      return;
    }
    expect(cancelled.value.state).toBe('cancelled');
    expect(cancelled.value.completedSentenceIds).toEqual([draft.sentences[0].id]);
  });

  it('reconciles progress from stored cache records after a reload', async () => {
    const reconciled = await repository.reconcile(job.id, [
      draft.sentences[0].id,
      draft.sentences[1].id,
    ]);

    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) {
      return;
    }
    expect(reconciled.value.completedSentenceIds).toHaveLength(2);
    expect(reconciled.value.state).toBe('running');

    const finished = await repository.reconcile(
      job.id,
      draft.sentences.map((sentence) => sentence.id),
    );
    expect(finished.ok && finished.value.state).toBe('complete');
  });

  it('never resurrects a cancelled job during reconciliation', async () => {
    await repository.setState(job.id, 'cancelled');

    const reconciled = await repository.reconcile(
      job.id,
      draft.sentences.map((sentence) => sentence.id),
    );

    expect(reconciled.ok && reconciled.value.state).toBe('cancelled');
  });

  it('reports a missing job instead of creating one', async () => {
    const missing = await repository.setState(jobId(uuid(8999)), 'cancelled');

    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.error.code).toBe('not-found');
    expect(await db.assetJobs.count()).toBe(1);
  });
});
