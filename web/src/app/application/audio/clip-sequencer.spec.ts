import { describe, expect, it } from 'vitest';
import type { AudioAsset, AudioAssetSummary } from '../../domain/enrichment/records';
import type { SentenceRef } from '../../domain/reading/reading-repository';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { audioSummaryFixture, clipReadingFixture } from '../../../testing/audio-clip-fixtures';
import type { AudioSequenceClip, AudioTimeline, SequencePlayOptions } from './audio-player';
import { ClipCatalogue } from './clip-catalogue';
import { ClipSequencer, type SequencePlayer, type SequenceBuildControl } from './clip-sequencer';

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

/** A resource the element holds: every clip it was built from or grown with. */
interface FakeResource {
  readonly clips: AudioSequenceClip[];
  open: boolean;
}

/**
 * The element, as far as the sequencer can tell: one second per sentence.
 *
 * Appends follow the real rule rather than a convenient one — they go to
 * whichever resource is open, and only when the container matches — so an
 * append that outlives the resource it was read for visibly lands in the next.
 */
class FakeSequencePlayer implements SequencePlayer {
  readonly rates: number[] = [];
  readonly started: { clips: AudioSequenceClip[]; options: SequencePlayOptions | undefined }[] = [];
  readonly appended: AudioSequenceClip[][] = [];
  /** Every resource built, oldest first. The last is the one the element holds. */
  readonly resources: FakeResource[] = [];
  closes = 0;
  failNextPlay = false;
  failNextExtend = false;
  /** Earliest time still buffered, as the element reports after evicting audio. */
  floor = 0;
  /** Held inside `playSequence`, after the resource has been requested. */
  playGate: Promise<void> | null = null;
  /** Held inside `extendSequence`. */
  extendGate: Promise<void> | null = null;

  setRate(rate: number): void {
    this.rates.push(rate);
  }

  async playSequence(
    clips: readonly AudioSequenceClip[],
    options?: SequencePlayOptions,
  ): Promise<AudioTimeline> {
    this.started.push({ clips: [...clips], options });
    if (this.playGate !== null) {
      await this.playGate;
    }
    if (this.failNextPlay) {
      this.failNextPlay = false;
      throw new Error('sequence unsupported');
    }
    this.resources.push({ clips: [...clips], open: options?.open === true });
    return this.timeline();
  }

  async extendSequence(clips: readonly AudioSequenceClip[]): Promise<AudioTimeline> {
    if (this.extendGate !== null) {
      await this.extendGate;
    }
    if (this.failNextExtend) {
      this.failNextExtend = false;
      throw new Error('append refused');
    }
    const resource = this.resources.at(-1);
    if (resource?.open !== true) {
      throw new Error('no open sequence');
    }
    if (clips.some((clip) => clip.mimeType !== resource.clips[0]?.mimeType)) {
      throw new Error('container mismatch');
    }
    resource.clips.push(...clips);
    this.appended.push([...clips]);
    return this.timeline();
  }

  closeSequence(): void {
    const resource = this.resources.at(-1);
    if (resource !== undefined) {
      resource.open = false;
    }
    this.closes += 1;
  }

  private timeline(): AudioTimeline {
    const resource = this.resources.at(-1);
    const length = resource?.clips.length ?? 0;
    return {
      starts: Array.from({ length }, (_, index) => index),
      duration: length,
      open: resource?.open === true,
      floor: this.floor,
    };
  }
}

class Bed {
  readonly player = new FakeSequencePlayer();
  readonly catalogue: ClipCatalogue;
  readonly sequencer: ClipSequencer;
  readonly reading: ReturnType<typeof clipReadingFixture>['reading'];
  readonly refs: readonly SentenceRef[];
  /** Every cache key read from storage, in order. */
  readonly reads: string[] = [];
  /** What storage answers a clip read with, by cache key. */
  readonly rows = new Map<string, Result<AudioAsset | null, StorageError>>();
  /** What a build asks the store about its own load. */
  readonly control: SequenceBuildControl = {
    current: () => this.live,
    startPaused: () => this.paused,
    continuous: () => this.continuous,
  };
  live = true;
  paused = false;
  continuous = true;
  /** The cache key a sentence's clip is stored under, by its position. */
  keyFor = (position: number): string => `${this.configuration}:${String(position)}`;
  /** The configuration the cache keys are made under. */
  configuration = 'current';
  /** Held in front of every clip read. */
  readGate: Promise<void> | null = null;
  /** Held in front of the next read of one key only. */
  private readonly holds = new Map<string, Promise<void>>();
  private summaries: AudioAssetSummary[] = [];

  constructor(count: number) {
    const { reading, refs } = clipReadingFixture(count);
    this.reading = reading;
    this.refs = refs;
    this.catalogue = new ClipCatalogue({
      readings: { listSentenceRefs: () => Promise.resolve(ok(refs)) },
      enrichment: { listAudioSummaries: () => Promise.resolve(ok(this.summaries)) },
      cacheKeysFor: (ordered) =>
        new Map(ordered.map((ref, position) => [ref.id, this.keyFor(position)])),
    });
    this.sequencer = new ClipSequencer(this.catalogue, {
      player: this.player,
      clips: {
        getAudioByCacheKey: async (cacheKey) => {
          this.reads.push(cacheKey);
          // What storage answers is fixed when the read begins, however late it lands.
          const row = this.rows.get(cacheKey) ?? ok(null);
          const hold = this.holds.get(cacheKey);
          this.holds.delete(cacheKey);
          if (hold !== undefined) {
            await hold;
          }
          if (this.readGate !== null) {
            await this.readGate;
          }
          return row;
        },
      },
      rateFor: (pace) => (pace === 'playback' ? 1.5 : 1),
    });
  }

  /** Holds the next read of one clip until the returned function is called. */
  holdNextRead(cacheKey: string): () => void {
    const held = gate();
    this.holds.set(cacheKey, held.opened);
    return held.open;
  }

  /** Writes the clip a sentence's key answers with, in this container. */
  setRow(position: number, mimeType: AudioAssetSummary['mimeType']): void {
    const summary = audioSummaryFixture(this.reading, this.refs[position]!, this.keyFor(position), {
      mimeType,
    });
    this.rows.set(
      summary.cacheKey,
      ok({ ...summary, blob: new Blob([new Uint8Array([position])], { type: mimeType }) }),
    );
  }

  /** Stores rows and clips for these sentences under the current configuration. */
  store(
    positions: readonly number[],
    options: {
      readonly pace?: 'playback' | null;
      readonly mimeType?: AudioAssetSummary['mimeType'];
    } = {},
  ): void {
    for (const position of positions) {
      const summary = audioSummaryFixture(
        this.reading,
        this.refs[position]!,
        this.keyFor(position),
        options,
      );
      this.summaries = [...this.summaries, summary];
      this.setRow(position, summary.mimeType);
    }
  }
}

function configure(count = 4): Bed {
  return new Bed(count);
}

/** Stores the sentences, reads them, and builds a resource from the first. */
async function built(bed: Bed, positions: readonly number[], startIndex = 0): Promise<void> {
  bed.store(positions);
  await bed.catalogue.refresh(bed.reading);
  expect(await bed.sequencer.build(startIndex, bed.control)).toMatchObject({ kind: 'built' });
}

/** Stores more sentences and lets the catalogue see them, as `prepare` does. */
async function storeMore(bed: Bed, positions: readonly number[]): Promise<void> {
  bed.store(positions);
  await bed.catalogue.refresh(bed.reading);
}

describe('ClipSequencer', () => {
  describe('building a resource', () => {
    it('builds one closed resource over a complete reading', async () => {
      const bed = configure();
      bed.store([0, 1, 2, 3]);
      await bed.catalogue.refresh(bed.reading);

      const result = await bed.sequencer.build(0, bed.control);

      expect(result).toEqual({ kind: 'built', startPaused: false });
      expect(bed.player.started).toHaveLength(1);
      expect(bed.player.started[0]?.clips.map((clip) => clip.mimeType)).toEqual(
        Array(4).fill('audio/mpeg'),
      );
      expect(bed.player.started[0]?.options).toEqual({
        startIndex: 0,
        startPaused: false,
        open: false,
      });
      expect(bed.sequencer.loaded).toBe(true);
      expect(bed.sequencer.open).toBe(false);
      expect(bed.sequencer.pace).toBe('playback');
      expect(bed.player.rates).toEqual([1.5]);
    });

    it('leaves the resource open while the reading is short of its end', async () => {
      const bed = configure();
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);

      await bed.sequencer.build(0, bed.control);

      expect(bed.player.started[0]?.options?.open).toBe(true);
      expect(bed.sequencer.open).toBe(true);
    });

    it('offsets the resource from the sentence it starts at', async () => {
      const bed = configure();
      await built(bed, [0, 1, 2, 3], 2);

      expect(bed.player.started[0]?.clips).toHaveLength(2);
      expect(bed.sequencer.timeOf(2)).toBe(0);
      expect(bed.sequencer.timeOf(3)).toBe(1);
      expect(bed.sequencer.timeOf(1)).toBeNull();
      expect(bed.sequencer.appendedLimitIndex()).toBe(3);
    });

    it('uses baked timing at the unscaled rate', async () => {
      const bed = configure();
      bed.store([0, 1, 2, 3], { pace: null });
      await bed.catalogue.refresh(bed.reading);

      await bed.sequencer.build(0, bed.control);

      expect(bed.sequencer.pace).toBe('baked');
      expect(bed.player.rates).toEqual([1]);
    });

    it('hands the player a Pause that arrived while the clips were read', async () => {
      const bed = configure();
      bed.store([0, 1, 2, 3]);
      await bed.catalogue.refresh(bed.reading);
      bed.paused = true;

      const result = await bed.sequencer.build(0, bed.control);

      expect(result).toEqual({ kind: 'built', startPaused: true });
      expect(bed.player.started[0]?.options?.startPaused).toBe(true);
    });

    it('reads a clip shared by two sentences once', async () => {
      const bed = configure(2);
      bed.keyFor = () => 'shared';
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);

      await bed.sequencer.build(0, bed.control);

      expect(bed.reads).toEqual(['shared']);
      expect(bed.player.started[0]?.clips).toHaveLength(2);
    });

    it('builds a complete run of WAV, which states its own length', async () => {
      const bed = configure(2);
      bed.store([0, 1], { mimeType: 'audio/wav' });
      await bed.catalogue.refresh(bed.reading);

      const result = await bed.sequencer.build(0, bed.control);

      expect(result).toMatchObject({ kind: 'built' });
      expect(bed.player.started[0]?.options?.open).toBe(false);
    });

    it('declines a WAV run short of the end, which could never grow', async () => {
      const bed = configure(4);
      bed.store([0, 1], { mimeType: 'audio/wav' });
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.build(0, bed.control)).toEqual({ kind: 'per-sentence' });
      expect(bed.player.started).toHaveLength(0);
      expect(bed.sequencer.loaded).toBe(false);
    });

    it('declines a container nothing can be built from', async () => {
      const bed = configure(2);
      bed.store([0, 1], { mimeType: 'audio/pcm' });
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.build(0, bed.control)).toEqual({ kind: 'per-sentence' });
    });

    it('declines when a clip the list promised is not there', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      bed.rows.delete('current:1');
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.build(0, bed.control)).toEqual({ kind: 'per-sentence' });
    });

    it('declines a start with no clip', async () => {
      const bed = configure(2);
      bed.store([1]);
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.build(0, bed.control)).toEqual({ kind: 'per-sentence' });
      expect(bed.reads).toEqual([]);
    });

    it('declines when the browser has no MediaSource for it', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      bed.player.failNextPlay = true;

      expect(await bed.sequencer.build(0, bed.control)).toEqual({ kind: 'per-sentence' });
      expect(bed.sequencer.loaded).toBe(false);
    });

    it('reports a storage failure with its message', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      bed.rows.set('current:1', err(storageError('unavailable', 'disk gone')));
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.build(0, bed.control)).toEqual({
        kind: 'failed',
        message: 'disk gone',
      });
    });

    it('does nothing once a newer load took over while the clips were read', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      const held = gate();
      bed.readGate = held.opened;
      const building = bed.sequencer.build(0, bed.control);
      await settle();

      bed.live = false;
      held.open();

      expect(await building).toEqual({ kind: 'superseded' });
      expect(bed.player.started).toHaveLength(0);
      expect(bed.sequencer.loaded).toBe(false);
    });

    it('does not adopt a resource a newer load superseded while it was assembled', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      const held = gate();
      bed.player.playGate = held.opened;
      const building = bed.sequencer.build(0, bed.control);
      await settle();

      bed.live = false;
      held.open();

      expect(await building).toEqual({ kind: 'superseded' });
      expect(bed.sequencer.loaded).toBe(false);
    });

    it('is superseded rather than declined when the refusal arrives after a newer load', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      const held = gate();
      bed.player.playGate = held.opened;
      bed.player.failNextPlay = true;
      const building = bed.sequencer.build(0, bed.control);
      await settle();

      bed.live = false;
      held.open();

      expect(await building).toEqual({ kind: 'superseded' });
    });

    it('declines a resource built after the learner left continuous mode', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      const held = gate();
      bed.player.playGate = held.opened;
      const building = bed.sequencer.build(0, bed.control);
      await settle();

      bed.continuous = false;
      held.open();

      expect(await building).toEqual({ kind: 'per-sentence' });
      expect(bed.sequencer.loaded).toBe(false);
    });

    it('forgets the resource when it is released', async () => {
      const bed = configure(2);
      await built(bed, [0, 1]);

      bed.sequencer.release();

      expect(bed.sequencer.loaded).toBe(false);
      expect(bed.sequencer.timeline).toBeNull();
      expect(bed.sequencer.pace).toBeNull();
    });
  });

  describe('growing while it is generated', () => {
    it('appends the sentences stored since the last append', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      await storeMore(bed, [2]);
      expect(await bed.sequencer.extend()).toBe(true);

      expect(bed.player.appended).toHaveLength(1);
      expect(bed.player.appended[0]).toHaveLength(1);
      expect(bed.sequencer.appendedLimitIndex()).toBe(2);
      expect(bed.sequencer.timeline?.duration).toBe(3);
      expect(bed.sequencer.open).toBe(true);
    });

    it('seals the resource once the last sentence is in', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      await storeMore(bed, [2, 3]);
      expect(await bed.sequencer.extend()).toBe(true);

      expect(bed.sequencer.open).toBe(false);
      expect(bed.player.closes).toBe(1);
    });

    it('appends nothing when nothing new was stored', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.player.appended).toHaveLength(0);
      expect(bed.player.closes).toBe(0);
      expect(bed.sequencer.open).toBe(true);
    });

    it('leaves a resource that was built closed alone', async () => {
      const bed = configure(2);
      await built(bed, [0, 1]);
      const reads = bed.reads.length;

      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.reads).toHaveLength(reads);
    });

    it('does not append a clip twice when a second refresh arrives mid-append', async () => {
      const bed = configure();
      await built(bed, [0, 1]);
      await storeMore(bed, [2]);
      const held = gate();
      bed.player.extendGate = held.opened;

      const first = bed.sequencer.extend();
      await settle();
      const second = bed.sequencer.extend();
      held.open();

      expect(await second).toBe(false);
      expect(await first).toBe(true);
      expect(bed.player.appended).toHaveLength(1);
    });

    it('seals at a pace boundary instead of mixing rates in one resource', async () => {
      const bed = configure();
      bed.store([0, 1]);
      bed.store([2], { pace: null });
      await bed.catalogue.refresh(bed.reading);
      await bed.sequencer.build(0, bed.control);
      expect(bed.sequencer.open).toBe(true);

      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.sequencer.open).toBe(false);
      expect(bed.player.appended).toHaveLength(0);
    });

    it('seals after an append that reaches a pace boundary', async () => {
      const bed = configure(5);
      await built(bed, [0, 1]);

      bed.store([2]);
      bed.store([3], { pace: null });
      await bed.catalogue.refresh(bed.reading);
      expect(await bed.sequencer.extend()).toBe(true);

      expect(bed.sequencer.appendedLimitIndex()).toBe(2);
      expect(bed.sequencer.open).toBe(false);
    });

    it('seals instead of appending a clip regenerated under new settings', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      bed.configuration = 'next';
      bed.store([0, 1, 2]);
      await bed.catalogue.refresh(bed.reading);
      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.sequencer.open).toBe(false);
      expect(bed.player.appended).toHaveLength(0);
    });

    it('seals rather than failing when the next clip cannot go into the resource', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      bed.store([2], { mimeType: 'audio/wav' });
      await bed.catalogue.refresh(bed.reading);
      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.sequencer.loaded).toBe(true);
      expect(bed.sequencer.open).toBe(false);
      expect(bed.player.appended).toHaveLength(0);
    });

    it('seals when the clip cannot be read', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      bed.store([2]);
      bed.rows.set('current:2', err(storageError('unavailable', 'disk gone')));
      await bed.catalogue.refresh(bed.reading);

      expect(await bed.sequencer.extend()).toBe(false);
      expect(bed.sequencer.open).toBe(false);
    });

    it('seals when the element refuses the append', async () => {
      const bed = configure();
      await built(bed, [0, 1]);
      await storeMore(bed, [2]);
      bed.player.failNextExtend = true;

      expect(await bed.sequencer.extend()).toBe(false);

      expect(bed.sequencer.open).toBe(false);
      expect(bed.sequencer.appendedLimitIndex()).toBe(1);
    });

    it('drops an append whose resource was released while its clips were read', async () => {
      const bed = configure();
      await built(bed, [0, 1]);
      await storeMore(bed, [2]);
      const held = gate();
      bed.readGate = held.opened;

      const extending = bed.sequencer.extend();
      await settle();
      bed.sequencer.release();
      held.open();

      expect(await extending).toBe(false);
      expect(bed.player.appended).toHaveLength(0);
      expect(bed.player.closes).toBe(0);
    });

    it('drops an append that landed after the resource was released', async () => {
      const bed = configure();
      await built(bed, [0, 1]);
      await storeMore(bed, [2]);
      const held = gate();
      bed.player.extendGate = held.opened;

      const extending = bed.sequencer.extend();
      await settle();
      bed.sequencer.release();
      held.open();

      expect(await extending).toBe(false);
    });
  });

  describe('when a newer load replaces the resource mid-flight', () => {
    /**
     * A newer build assigns its resource in the one hop between an append's last
     * check and the code that acts on its answer. The two gates are opened in
     * the order that puts the replacement there: the append's read lands first,
     * and the replacement is adopted on the next turn, before the append resumes.
     */
    async function replacedAsAppendResumes(
      bed: Bed,
      options: { readonly appendRow: AudioAssetSummary['mimeType'] },
    ): Promise<{ readonly extending: Promise<boolean>; readonly replacement: FakeResource }> {
      await built(bed, [0, 1]);
      bed.store([2], { mimeType: options.appendRow });
      await bed.catalogue.refresh(bed.reading);
      const landed = bed.holdNextRead('current:2');
      const extending = bed.sequencer.extend();
      await settle();

      // The replacement reads what is stored now, and is held just short of adoption.
      bed.setRow(2, 'audio/mpeg');
      const adopted = gate();
      bed.player.playGate = adopted.opened;
      const building = bed.sequencer.build(0, bed.control);
      await settle();

      landed();
      adopted.open();
      expect(await building).toMatchObject({ kind: 'built' });
      return { extending, replacement: bed.player.resources[1]! };
    }

    it('does not append clips read for the old resource to the new one', async () => {
      const bed = configure(6);

      const { extending, replacement } = await replacedAsAppendResumes(bed, {
        appendRow: 'audio/mpeg',
      });

      expect(await extending).toBe(false);
      expect(bed.player.appended).toHaveLength(0);
      expect(replacement.clips).toHaveLength(3);
      expect(bed.sequencer.timeline?.duration).toBe(3);
    });

    it('does not seal the new resource over a clip the old one could not take', async () => {
      const bed = configure(6);

      const { extending, replacement } = await replacedAsAppendResumes(bed, {
        appendRow: 'audio/wav',
      });

      expect(await extending).toBe(false);
      expect(replacement.open).toBe(true);
      expect(bed.sequencer.open).toBe(true);
      expect(bed.player.closes).toBe(0);
    });

    it('does not seal the new resource over an append the element refused', async () => {
      const bed = configure(6);
      await built(bed, [0, 1]);
      await storeMore(bed, [2]);
      const held = gate();
      bed.player.extendGate = held.opened;
      bed.player.failNextExtend = true;
      const extending = bed.sequencer.extend();
      await settle();

      bed.player.extendGate = null;
      expect(await bed.sequencer.build(0, bed.control)).toMatchObject({ kind: 'built' });
      held.open();

      expect(await extending).toBe(false);
      expect(bed.sequencer.open).toBe(true);
      expect(bed.player.closes).toBe(0);
    });

    it('does not start a resource once the load was superseded after the last clip was read', async () => {
      const bed = configure(2);
      bed.store([0, 1]);
      await bed.catalogue.refresh(bed.reading);
      // One check follows each of the two clip reads; the third is the last, before the player.
      let checks = 0;
      const control = {
        ...bed.control,
        current: () => {
          checks += 1;
          return checks <= 2;
        },
      };

      expect(await bed.sequencer.build(0, control)).toEqual({ kind: 'superseded' });

      expect(checks).toBe(3);
      expect(bed.player.started).toHaveLength(0);
      expect(bed.player.rates).toEqual([]);
      expect(bed.sequencer.loaded).toBe(false);
    });
  });

  describe('sealing', () => {
    it('closes the element once however often it is asked', async () => {
      const bed = configure();
      await built(bed, [0, 1]);

      bed.sequencer.seal();
      bed.sequencer.seal();

      expect(bed.player.closes).toBe(1);
      expect(bed.sequencer.open).toBe(false);
    });

    it('does nothing without a resource', () => {
      const bed = configure();

      bed.sequencer.seal();

      expect(bed.player.closes).toBe(0);
    });
  });

  describe('the resource against the reading', () => {
    it('knows nothing without a resource', () => {
      const { sequencer } = configure();

      expect(sequencer.timeOf(0)).toBeNull();
      expect(sequencer.spanOf(0)).toBeNull();
      expect(sequencer.locate(0)).toBeNull();
      expect(sequencer.clampTime(3)).toBeNull();
      expect(sequencer.appendedLimitIndex()).toBe(-1);
      expect(sequencer.open).toBe(false);
    });

    it('says where a sentence starts and ends, the last ending with the resource', async () => {
      const bed = configure();
      await built(bed, [0, 1, 2, 3], 1);

      expect(bed.sequencer.spanOf(1)).toEqual({ start: 0, end: 1 });
      expect(bed.sequencer.spanOf(3)).toEqual({ start: 2, end: 3 });
      expect(bed.sequencer.spanOf(0)).toBeNull();
    });

    it('finds the sentence heard at a time', async () => {
      const bed = configure();
      await built(bed, [0, 1, 2, 3], 1);

      expect(bed.sequencer.locate(0)).toEqual({ refIndex: 1, start: 0 });
      expect(bed.sequencer.locate(1.4)).toEqual({ refIndex: 2, start: 1 });
      expect(bed.sequencer.locate(99)).toEqual({ refIndex: 3, start: 2 });
    });

    it('never offers a time below what is still buffered', async () => {
      const bed = configure();
      bed.player.floor = 1.5;
      await built(bed, [0, 1, 2, 3]);

      expect(bed.sequencer.timeOf(0)).toBe(1.5);
      expect(bed.sequencer.timeOf(2)).toBe(2);
      expect(bed.sequencer.clampTime(0)).toBe(1.5);
      expect(bed.sequencer.clampTime(99)).toBe(4);
    });
  });
});
