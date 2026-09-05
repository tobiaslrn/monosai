import { PreparationStore } from '../enrichment/preparation.store';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ok } from '../../domain/shared/result';
import {
  configureGenerationTestBed,
  strictStory,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';
import { FakeReadingMutationChannel } from '../../../testing/reading-mutation-channel-fake';
import { READING_MUTATION_CHANNEL } from '../shared/repository-tokens';
import { LibraryStore } from '../reading/library.store';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { GenerationJobsStore, MAX_CONCURRENT_GENERATIONS } from './generation-jobs.store';

const PREMISE = { premise: 'ねこが一日をすごす話。' };

describe('GenerationJobsStore', () => {
  let bed: GenerationTestBed;
  let jobs: GenerationJobsStore;
  let library: LibraryStore;
  let reconciled: ReadingId[];

  beforeEach(() => {
    reconciled = [];
    bed = configureGenerationTestBed({
      extraProviders: [
        { provide: READING_MUTATION_CHANNEL, useValue: new FakeReadingMutationChannel() },
        {
          // Only what a saved story asks of the lane. The real one reaches the
          // job repository and three producers, none of which writing a story
          // has any business starting.
          provide: PreparationStore,
          useValue: {
            reconcile: (reading: Reading) => {
              reconciled.push(reading.id);
              return Promise.resolve();
            },
          },
        },
      ],
    });
    jobs = TestBed.inject(GenerationJobsStore);
    library = TestBed.inject(LibraryStore);
  });

  /**
   * A run is a long chain of awaited calls that nothing here holds a promise
   * for — that is the point of a background job — so the bed is drained until
   * the runs have nowhere left to continue.
   */
  async function settle(): Promise<void> {
    for (let pass = 0; pass < 20; pass += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
    }
  }

  it('finishes a story after the screen that started it is gone', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    const id = jobs.start(5, PREMISE);
    expect(id).not.toBeNull();
    // Nothing watches it: this is a learner who walked away to the library.
    await settle();

    expect(bed.readings.readings).toHaveLength(1);
    // The story is in the library, so the row would only repeat it.
    expect(jobs.libraryEntries()).toHaveLength(0);
    expect(jobs.jobs()).toHaveLength(0);
    expect(library.items()).toHaveLength(1);
    expect(library.announcement()).toContain('ready');
  });

  it('keeps a watched job, so the screen showing it can report the save', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    const id = jobs.start(5, PREMISE);
    jobs.watch(id);
    await settle();

    expect(jobs.job(id!)?.store.state().kind).toBe('saved');
    // A saved story is represented by the reading, not by a second row.
    expect(jobs.libraryEntries()).toHaveLength(0);

    jobs.release(id!);
    expect(jobs.jobs()).toHaveLength(0);
  });

  it('writes several stories at once and refuses more than the limit', async () => {
    for (let index = 0; index < MAX_CONCURRENT_GENERATIONS; index += 1) {
      bed.provider.storyQueue.push(ok(strictStory()));
    }

    const started = Array.from({ length: MAX_CONCURRENT_GENERATIONS }, () =>
      jobs.start(5, PREMISE),
    );

    expect(started.every((id) => id !== null)).toBe(true);
    expect(new Set(started).size).toBe(MAX_CONCURRENT_GENERATIONS);
    expect(jobs.runningCount()).toBe(MAX_CONCURRENT_GENERATIONS);
    expect(jobs.canStart()).toBe(false);
    expect(jobs.start(5, PREMISE)).toBeNull();

    await settle();

    expect(bed.readings.readings).toHaveLength(MAX_CONCURRENT_GENERATIONS);
    expect(jobs.runningCount()).toBe(0);
    expect(jobs.canStart()).toBe(true);
  });

  it('stops a dismissed run and saves nothing', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    const id = jobs.start(5, PREMISE);
    jobs.dismiss(id!);
    await settle();

    expect(jobs.jobs()).toHaveLength(0);
    expect(bed.readings.readings).toHaveLength(0);
  });

  it('holds one busy reason while runs come and go', async () => {
    const busy = TestBed.inject(AppBusyRegistry);
    bed.provider.storyQueue.push(ok(strictStory()), ok(strictStory()));

    const first = jobs.start(5, PREMISE);
    jobs.start(5, PREMISE);
    TestBed.tick();
    expect(busy.busyReason()).toBe('2 stories are being generated');

    // Ending one must not clear a reason the other is still holding.
    jobs.dismiss(first!);
    TestBed.tick();
    expect(busy.busyReason()).toBe('a story is being generated');

    await settle();
    expect(busy.isBusy()).toBe(false);
  });

  it('keeps a stopped run listed until it is dismissed', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    const id = jobs.start(5, PREMISE);
    jobs.job(id!)?.store.cancel();
    await settle();

    const entry = jobs.libraryEntries()[0];
    expect(entry.id).toBe(id);
    expect(entry.store.state().kind).toBe('cancelled');
    expect(entry.premise).toBe(PREMISE.premise);
  });

  it('queues the preparation a saved story declares', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    expect(jobs.start(5, PREMISE)).not.toBeNull();
    await settle();

    expect(reconciled).toHaveLength(1);
  });
});
