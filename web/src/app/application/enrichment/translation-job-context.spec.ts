import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../domain/shared/clock';
import { ok } from '../../domain/shared/result';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieJobRepository } from '../../infrastructure/persistence/repositories/dexie-job.repository';
import {
  configureGenerationTestBed,
  story,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { JOB_REPOSITORY } from '../shared/repository-tokens';
import { TranslationJobStore } from './translation-job.store';

const PREMISE = { premise: 'ミケが一日をすごす話。' };

/** Five sentences — one bounded batch — in which the cat has a name. */
const NAMED_STORY = story(
  [
    'ミケがいます。',
    'ミケはねます。',
    'ミケはたべます。',
    'ミケはあるきます。',
    'ミケはのみます。',
  ],
  'ミケの一日',
);

/**
 * What a generated story's translation request carries once generation has
 * stopped producing aids.
 *
 * Generation used to assemble this inline, from the story it had just written
 * and the profile it had just captured. The same facts are on disk afterwards,
 * so the whole-reading job assembles them from storage — and this test pins the
 * request that used to be sent, rather than trusting that it still is.
 */
describe('the whole-reading translation job', () => {
  let db: MonosaiDatabase;
  let bed: GenerationTestBed;

  beforeEach(async () => {
    db = await createTestDatabase();
    bed = configureGenerationTestBed({
      extraProviders: [
        { provide: JOB_REPOSITORY, useValue: new DexieJobRepository(db, fixedClock(1)) },
      ],
    });
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('sends the title, premise, register, and names generation used to send inline', async () => {
    bed.provider.storyQueue.push(ok(NAMED_STORY));
    await bed.store.generate(5, PREMISE);
    const state = bed.store.state();
    if (state.kind !== 'saved') {
      expect.unreachable('expected a saved story');
      return;
    }
    // Nothing was translated on the way into the library.
    expect(bed.provider.translationRequests).toHaveLength(0);

    await TestBed.inject(TranslationJobStore).start(state.reading.id);

    expect(bed.provider.translationRequests).toHaveLength(1);
    const request = bed.provider.translationRequests[0];
    expect(request.titleJa).toBe('ミケの一日');
    expect(request.premiseJa).toBe(PREMISE.premise);
    expect(request.registerPreference).toBe('either');
    expect(request.window.filter((entry) => entry.targetId !== null)).toHaveLength(5);
  });

  it('carries a name it has already rendered into the next batch', async () => {
    // Twelve distinct sentences: two independent requests, with the cat named
    // in both. Nothing shares Japanese, so the second request learns nothing
    // from the cache and only what the first one settled can reach it.
    const long = story(
      [
        'ねこはいます。',
        'ねこはねます。',
        'ねこはたべます。',
        'ねこはあるきます。',
        'ねこはのみます。',
        'ねこはいきます。',
        'ミケはいます。',
        'ミケはねます。',
        'ミケはたべます。',
        'ミケはあるきます。',
        'ミケはのみます。',
        'ミケはいきます。',
      ],
      'ミケの一日',
    );
    bed.provider.storyQueue.push(ok(long));
    await bed.store.generate(12, PREMISE);
    const state = bed.store.state();
    if (state.kind !== 'saved') {
      expect.unreachable('expected a saved story');
      return;
    }

    await TestBed.inject(TranslationJobStore).start(state.reading.id);

    expect(bed.provider.translationRequests).toHaveLength(2);
    expect(bed.provider.translationRequests[0].establishedRenderings).toBeUndefined();
    expect(bed.provider.translationRequests[1].establishedRenderings).toEqual([
      { surfaceJa: 'ミケ', exampleJa: 'ミケはいます。', exampleEn: 'EN: ミケはいます。' },
    ]);
  });
});
