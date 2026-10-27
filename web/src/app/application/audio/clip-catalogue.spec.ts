import { describe, expect, it } from 'vitest';
import type { AudioAssetSummary } from '../../domain/enrichment/records';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import {
  audioSummaryFixture,
  cacheKeysFixture,
  clipReadingFixture,
} from '../../../testing/audio-clip-fixtures';
import { ClipCatalogue } from './clip-catalogue';

/** A promise the spec settles, so a read can be held at an exact point. */
function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Lets every read already begun reach its next hold. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Bed {
  readonly catalogue: ClipCatalogue;
  readonly reading: ReturnType<typeof clipReadingFixture>['reading'];
  readonly refs: readonly SentenceRef[];
  /** What the audio list returns. */
  summaries: Result<readonly AudioAssetSummary[], StorageError>;
  refsResult: Result<readonly SentenceRef[], StorageError> | null;
  /** The configuration the cache keys are made under. */
  configuration: string;
  /** Held in front of the audio list, to leave a refresh in flight. */
  summaryGate: Promise<void> | null;
  /** Rows for these sentences, under the current configuration. */
  store(positions: readonly number[], options?: { readonly pace?: 'playback' | null }): void;
}

function configure(count = 4): Bed {
  const { reading, refs } = clipReadingFixture(count);
  const bed: Bed = {
    reading,
    refs,
    summaries: ok([]),
    refsResult: null,
    configuration: 'current',
    summaryGate: null,
    catalogue: new ClipCatalogue({
      readings: { listSentenceRefs: () => Promise.resolve(bed.refsResult ?? ok(refs)) },
      enrichment: {
        listAudioSummaries: async () => {
          const result = bed.summaries;
          if (bed.summaryGate !== null) {
            await bed.summaryGate;
          }
          return result;
        },
      },
      cacheKeysFor: (ordered) => cacheKeysFixture(ordered, bed.configuration),
    }),
    store(positions, options = {}) {
      const rows = positions.map((position) =>
        audioSummaryFixture(
          reading,
          refs[position]!,
          `${bed.configuration}:${String(position)}`,
          options,
        ),
      );
      bed.summaries = ok([...(bed.summaries.ok ? bed.summaries.value : []), ...rows]);
    },
  };
  return bed;
}

describe('ClipCatalogue', () => {
  it('knows nothing before a reading is read', () => {
    const { catalogue } = configure();

    expect(catalogue.reading()).toBeNull();
    expect(catalogue.sentenceCount()).toBe(0);
    expect(catalogue.hasPlayableAudio()).toBe(false);
    expect(catalogue.canPlayWholeReading()).toBe(false);
  });

  describe('coverage and playability', () => {
    it('counts a clip under the current key as covered and playable', async () => {
      const bed = configure();
      bed.store([0, 1]);

      expect(await bed.catalogue.refresh(bed.reading)).toEqual({ kind: 'refreshed' });

      expect(bed.catalogue.reading()).toBe(bed.reading);
      expect(bed.catalogue.sentenceCount()).toBe(4);
      expect(bed.catalogue.availableCount()).toBe(2);
      expect(bed.catalogue.missingCount()).toBe(2);
      expect(bed.catalogue.hasPlayableAudio()).toBe(true);
      expect(bed.catalogue.hasStaleAudio()).toBe(false);
      expect(bed.catalogue.canPlayWholeReading()).toBe(false);
      expect(bed.catalogue.isAvailable(bed.refs[1]!.id)).toBe(true);
      expect(bed.catalogue.isAvailable(bed.refs[2]!.id)).toBe(false);
      expect(bed.catalogue.isAvailable(null)).toBe(false);
    });

    it('is complete only when every sentence has a current clip', async () => {
      const bed = configure(2);
      bed.store([0, 1]);

      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.canPlayWholeReading()).toBe(true);
    });

    it('plays the newest same-text clip from other settings without covering the sentence', async () => {
      const bed = configure(2);
      bed.configuration = 'old';
      bed.store([0]);
      bed.summaries = ok([
        ...(bed.summaries.ok ? bed.summaries.value : []),
        audioSummaryFixture(bed.reading, bed.refs[0]!, 'older', { createdAt: 1 }),
      ]);
      bed.configuration = 'current';

      await bed.catalogue.refresh(bed.reading);

      const playable = bed.catalogue.playable().get(bed.refs[0]!.id);
      expect(playable).toEqual({ cacheKey: 'old:0', stale: true, pace: 'playback' });
      expect(bed.catalogue.hasStaleAudio()).toBe(true);
      expect(bed.catalogue.hasPlayableAudio()).toBe(true);
      expect(bed.catalogue.availableCount()).toBe(0);
      expect(bed.catalogue.canPlayWholeReading()).toBe(false);
    });

    it('never lends a clip to a sentence whose text is different', async () => {
      const bed = configure(2);
      bed.summaries = ok([
        { ...audioSummaryFixture(bed.reading, bed.refs[0]!, 'edited'), sourceContentHash: 'other' },
      ]);

      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.hasPlayableAudio()).toBe(false);
    });

    it('marks a row without the playback pace as baked', async () => {
      const bed = configure(2);
      bed.store([0], { pace: null });
      bed.store([1]);

      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.playable().get(bed.refs[0]!.id)?.pace).toBe('baked');
      expect(bed.catalogue.playable().get(bed.refs[1]!.id)?.pace).toBe('playback');
    });

    it('reads sentences in reading order whatever order storage returns them', async () => {
      const bed = configure(3);
      bed.refsResult = ok([...bed.refs].reverse());

      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.refs()).toEqual(bed.refs);
    });
  });

  describe('latest wins', () => {
    it('drops a read that was replaced before it landed', async () => {
      const bed = configure();
      bed.store([0]);
      const held = gate();
      bed.summaryGate = held.opened;
      const older = bed.catalogue.refresh(bed.reading);
      await settle();

      // A newer, larger read finishes first, as a run storing a clip would cause.
      bed.summaryGate = null;
      bed.store([1, 2]);
      expect(await bed.catalogue.refresh(bed.reading)).toEqual({ kind: 'refreshed' });
      held.open();

      expect(await older).toEqual({ kind: 'superseded' });
      expect(bed.catalogue.availableCount()).toBe(3);
    });

    it('stops claiming coverage for the old settings while the new ones are read', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      expect(bed.catalogue.canPlayWholeReading()).toBe(true);

      bed.configuration = 'next';
      const held = gate();
      bed.summaryGate = held.opened;
      const refreshing = bed.catalogue.refresh(bed.reading);
      await settle();

      expect(bed.catalogue.missingCount()).toBe(2);
      expect(bed.catalogue.hasPlayableAudio()).toBe(true);
      held.open();
      await refreshing;
      expect(bed.catalogue.hasStaleAudio()).toBe(true);
    });
  });

  describe('storage failures', () => {
    it('claims nothing playable when the sentences cannot be read', async () => {
      const bed = configure();
      bed.store([0]);
      await bed.catalogue.refresh(bed.reading);
      bed.refsResult = err(storageError('unavailable', 'no sentences'));

      const refreshed = await bed.catalogue.refresh(bed.reading);

      expect(refreshed).toEqual({ kind: 'unreadable', message: 'no sentences' });
      expect(bed.catalogue.hasPlayableAudio()).toBe(false);
      expect(bed.catalogue.playable().size).toBe(0);
    });

    it('claims nothing playable when the clips cannot be listed', async () => {
      const bed = configure();
      bed.store([0]);
      await bed.catalogue.refresh(bed.reading);
      bed.summaries = err(storageError('unavailable', 'no clips'));

      const refreshed = await bed.catalogue.refresh(bed.reading);

      expect(refreshed).toEqual({ kind: 'unreadable', message: 'no clips' });
      expect(bed.catalogue.hasPlayableAudio()).toBe(false);
      expect(bed.catalogue.hasStaleAudio()).toBe(false);
      expect(bed.catalogue.sentenceCount()).toBe(4);
    });
  });

  describe('forgetting', () => {
    it('keeps the sentences when only the clips go', async () => {
      const bed = configure();
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);

      bed.catalogue.forgetClips();

      expect(bed.catalogue.reading()).toBe(bed.reading);
      expect(bed.catalogue.sentenceCount()).toBe(4);
      expect(bed.catalogue.hasPlayableAudio()).toBe(false);
      expect(bed.catalogue.missingCount()).toBe(4);
    });

    it('lets go of the reading too when it is deleted', async () => {
      const bed = configure();
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);

      bed.catalogue.forgetReading();

      expect(bed.catalogue.reading()).toBeNull();
      expect(bed.catalogue.sentenceCount()).toBe(0);
      expect(bed.catalogue.hasPlayableAudio()).toBe(false);
    });
  });

  describe('moving between sentences with holes in the reading', () => {
    async function withHoles(): Promise<Bed> {
      const bed = configure(6);
      bed.store([1, 2, 4]);
      await bed.catalogue.refresh(bed.reading);
      return bed;
    }

    it('says where a sentence is, one-based', async () => {
      const bed = await withHoles();

      expect(bed.catalogue.positionOf(bed.refs[3]!.id)).toBe(4);
      expect(bed.catalogue.positionOf(bed.refs[0]!.id)).toBe(1);
    });

    it('starts at the first sentence that has a clip, not at sentence one', async () => {
      const bed = await withHoles();

      expect(bed.catalogue.firstAvailable()).toBe(bed.catalogue.refs()[1]);
    });

    it('steps over a hole in either direction', async () => {
      const bed = await withHoles();

      expect(bed.catalogue.availableIndexFrom(bed.refs[2]!.id, 1)).toBe(4);
      expect(bed.catalogue.availableIndexFrom(bed.refs[4]!.id, -1)).toBe(2);
      expect(bed.catalogue.availableIndexFrom(bed.refs[4]!.id, 1)).toBe(-1);
      expect(bed.catalogue.availableIndexFrom(bed.refs[1]!.id, -1)).toBe(-1);
      expect(bed.catalogue.availableIndexFrom(null, 1)).toBe(-1);
    });

    it('snaps a position in a hole to the nearest clip, backwards on a tie', async () => {
      const bed = await withHoles();

      expect(bed.catalogue.nearestAvailableIndex(0)).toBe(1);
      expect(bed.catalogue.nearestAvailableIndex(3)).toBe(2);
      expect(bed.catalogue.nearestAvailableIndex(5)).toBe(4);
    });

    it('finds no nearest clip when there are none', async () => {
      const bed = configure();
      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.nearestAvailableIndex(1)).toBe(-1);
    });
  });

  describe('a contiguous run', () => {
    it('stops at the first sentence without a clip', async () => {
      const bed = configure(5);
      bed.store([1, 2, 4]);
      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.contiguousRunFrom(1)).toEqual([bed.refs[1], bed.refs[2]]);
      expect(bed.catalogue.contiguousRunFrom(0)).toEqual([]);
      expect(bed.catalogue.contiguousRunFrom(4)).toEqual([bed.refs[4]]);
    });

    it('stops where the pace changes, because one resource has one rate', async () => {
      const bed = configure(4);
      bed.store([0, 1], { pace: null });
      bed.store([2, 3]);
      await bed.catalogue.refresh(bed.reading);

      expect(bed.catalogue.contiguousRunFrom(0)).toEqual([bed.refs[0], bed.refs[1]]);
      expect(bed.catalogue.contiguousRunFrom(2)).toEqual([bed.refs[2], bed.refs[3]]);
    });
  });
});
