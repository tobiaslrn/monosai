import { Injectable, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import {
  AudioJobStore,
  isAudioRunInProgress,
  type AudioJobProgress,
} from '../enrichment/audio-job.store';
import { PreparationStore } from '../enrichment/preparation.store';
import { ReadingAudioMaintenanceStore } from '../enrichment/reading-audio-maintenance.store';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { TtsStore } from '../settings/tts.store';
import { AUDIO_DECODER } from '../shared/ai-tokens';
import { LOGGER, NOOP_LOGGER, reportRejection, type Logger } from '../shared/diagnostics';
import { ReaderStore } from './reader.store';

/**
 * The open reading's audio as the reader shows it: the run's own progress, or
 * `queued` while a request waits on its row for the preparation lane.
 */
export type ReaderAudioProgress =
  AudioJobProgress | { readonly kind: 'queued'; readonly readingId: ReadingId };

/**
 * Whether audio is on its way for the learner: a run going, parked between
 * batches, or a request the lane has not started yet.
 */
export function isReaderAudioInProgress(progress: ReaderAudioProgress): boolean {
  return progress.kind === 'queued' || isAudioRunInProgress(progress);
}

/**
 * Everything the reader knows about the open reading's audio.
 *
 * The reader page was wiring five audio collaborators — the generation job,
 * application-wide playback, this reading's clip maintenance, the voice
 * settings, and the configuration that decides whether generating is even
 * possible — alongside two unrelated concerns. They belong together and they
 * belong out of the component: what is left there is a floating card, the
 * height it publishes, and a confirmation.
 *
 * Provided by the reader, so the player's open state dies with the screen while
 * playback, which is application-wide, outlives it.
 */
@Injectable()
export class ReaderAudioStore {
  private readonly reader = inject(ReaderStore);
  private readonly job = inject(AudioJobStore);
  private readonly lane = inject(PreparationStore);
  private readonly maintenance = inject(ReadingAudioMaintenanceStore);
  private readonly configuration = inject(AudioConfigurationService);
  private readonly network = inject(NETWORK_STATUS);
  private readonly decoder = inject(AUDIO_DECODER);
  readonly playback = inject(AudioPlaybackStore);
  readonly tts = inject(TtsStore);

  /**
   * The reading being read, which the page owns: the route names it before the
   * reading itself has loaded, and audio progress is asked for from that moment.
   */
  private readonly readingIdSignal = signal<ReadingId | null>(null);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly playerOpenSignal = signal(false);
  private readonly playerSentenceIdSignal = signal<SentenceId | null>(null);

  /** Whether the floating player card is showing. */
  readonly playerOpen = this.playerOpenSignal.asReadonly();

  /**
   * The sentence that was selected when the player was opened.
   *
   * The player is independent of the sentence and word popovers, so the
   * selection stays visible while this captured value powers "Start from this
   * sentence".
   */
  readonly playerSentenceId = this.playerSentenceIdSignal.asReadonly();

  readonly maintenanceState = computed(() => this.maintenance.state());
  readonly maintenanceError = computed(() => this.maintenance.error());

  /**
   * Read through the lane, the source Story options reads, so a request still
   * waiting for its turn shows as waiting in both places rather than as an
   * offer to generate on the player.
   */
  readonly progress = computed<ReaderAudioProgress>(() => {
    const id = this.readingIdSignal();
    if (id === null) return this.job.idleProgress;
    const lane = this.lane.progressFor(id, 'audio');
    return lane.kind === 'queued' ? lane : this.job.progressFor(id);
  });

  /**
   * This browser has nothing to decode audio with, so no clip it was sent could
   * be kept and generating would only fail. Asked again whenever the run moves,
   * since a run is how a browser whose contexts all refuse is found out.
   */
  readonly decoderMissing = computed(() => {
    this.progress();
    return !this.decoder.available();
  });

  private readonly decoderNoticeDismissed = signal(false);

  /** Whether the player still reports the missing decoder; dismissing it puts it away. */
  readonly decoderNotice = computed(() => this.decoderMissing() && !this.decoderNoticeDismissed());

  /**
   * A run is in progress for the learner, including one parked between batches
   * and a request waiting for the lane.
   */
  readonly running = computed(() => isReaderAudioInProgress(this.progress()));

  /**
   * The sentence the reader tints as the one read aloud.
   *
   * While the player shows, the session's cursor, whatever state it is in.
   * Behind a closed player, only while the reading is being heard or will go
   * on by itself: a paused, held or finished session, or a wait for a clip no
   * run is making, keeps its cursor for the player alone, and a tint on a
   * silent page marks nothing.
   */
  readonly playingSentenceId = computed(() => {
    const sentenceId = this.playback.currentSentenceId();
    if (this.playerOpenSignal()) return sentenceId;
    switch (this.playback.status()) {
      case 'playing':
      case 'loading':
        return sentenceId;
      case 'waiting':
        return this.running() ? sentenceId : null;
      default:
        return null;
    }
  });

  /** Whether a waiting run is waiting for the connection rather than its turn. */
  readonly online = computed(() => this.network.isOnline());

  /**
   * Whether this reading has a clip to delete: one saved before it opened, or
   * one a running or parked run has saved since. A request that has produced
   * nothing yet has nothing to delete; its stop is on the player.
   */
  readonly hasSavedAudio = computed(
    () =>
      (this.reader.reading()?.audioSummary.completed ?? 0) > 0 ||
      this.playback.availableCount() > 0,
  );

  /**
   * Whether generation would be refused for want of a configuration.
   *
   * Resolved through the same service the job itself gates on rather than
   * through saved presets: a tested model and voice with no preset saved is an
   * ordinary state, and it was being offered "Set up audio" beside a
   * Generate button that worked perfectly.
   */
  readonly hasModel = computed(() => this.configuration.resolve('tts-synthesis').ok);

  /** Whether a speech model is chosen; a voice is optional for models that pick their own. */
  readonly voiceChosen = computed(() => this.tts.settings().modelId !== '');

  /**
   * The audio button says its state out loud, because its icon never changes.
   *
   * Playback is named before generation, not after it: the two now run at the
   * same time, and what the learner is hearing is the more useful of the two to
   * be told about.
   */
  readonly buttonLabel = computed(() => {
    switch (this.playback.status()) {
      case 'playing':
        return 'Audio, playing';
      case 'paused':
        return 'Audio, paused';
      case 'waiting':
        return 'Audio, waiting for the next sentence';
      case 'stepped':
        return 'Audio, ready for the next sentence';
      case 'ended':
        return 'Audio, finished';
      default:
        break;
    }
    if (this.running()) {
      return 'Audio, being generated';
    }
    return this.playback.hasPlayableAudio() ? 'Audio, ready' : 'Audio';
  });

  /** A reading with no sentences mounted has nothing for a player to play. */
  readonly canOpenPlayer = computed(
    () =>
      this.reader.status() === 'ready' &&
      this.reader.paragraphs().some((paragraph) => paragraph.sentences.length > 0),
  );

  /**
   * The run's progress as it stood when the clip list was last read in full.
   * A run that has just stopped may have stored its last clip in the same
   * moment, so a wait is only released once the list read after the stop is in.
   */
  private readonly listedAt = signal<ReaderAudioProgress | null>(null);

  constructor() {
    // Which clips exist, re-read whenever the reading changes and whenever the
    // audio job has written more. Two local reads: the player appears because
    // clips exist, never because a run started. The re-read is also what lets a
    // session waiting at the frontier read on, since the clip it is waiting for
    // becomes available here (ADR 0034). Here because playback is
    // application-wide and outlives the reader, so it cannot watch this reading's
    // job itself.
    resource({
      params: () => {
        const reading = this.reader.reading();
        const progress = this.progress();
        const voice = this.tts.settings();
        return reading === null ? undefined : { reading, progress, voice };
      },
      loader: ({ params, abortSignal }) =>
        this.playback
          .prepare(params.reading)
          .catch((error: unknown) => {
            reportRejection(this.logger, error);
          })
          .finally(() => {
            // A read that a newer one replaced can finish after it; its older
            // progress must not stand as the last read in full.
            if (!abortSignal.aborted) this.listedAt.set(params.progress);
          }),
    });

    // An effect because whether a run is still coming belongs to the reader, not
    // to playback, and releasing a wait is a command.
    effect(() => {
      // A session at the frontier is waiting for a clip the run is about to
      // store. Once the run has failed or been cancelled that clip is never
      // coming, and only the reader knows: the playback store has no business
      // watching a generation job, so the word is passed from here.
      //
      // Told whether or not a wait is showing, because a continuous session
      // holds inside its own resource: that resource has to be sealed for the
      // element to reach the end of what was made rather than stall at it.
      // The wait is still watched too — one sentence at a time can start one
      // *after* the run has stopped, and a release that only fired on the job's
      // own transition would leave it waiting for something already called off.
      //
      // Not before the clips are re-read once the run has stopped: the clip
      // the session is waiting for may be among the last the run stored, and
      // releasing first would end the wait on a sentence that has audio.
      const progress = this.progress();
      const kind = progress.kind;
      this.playback.status();
      const listed = this.reader.reading() === null || this.listedAt() === progress;
      if ((kind === 'failed' || kind === 'cancelled') && listed) {
        untracked(() => {
          this.playback.stopExpectingClips();
        });
      }
    });
  }

  /**
   * Shows the player, capturing the sentence selected as it opens.
   *
   * Opening loads nothing and starts nothing: the card is a transport, and what
   * it shows is whatever the application-wide playback is already doing.
   */
  openPlayer(selectedSentenceId: SentenceId | null): void {
    if (!this.canOpenPlayer() || this.playerOpenSignal()) {
      return;
    }
    this.playerSentenceIdSignal.set(selectedSentenceId);
    this.playerOpenSignal.set(true);
  }

  /**
   * Hides the player. Deliberately not a stop: hiding the card to read the text
   * underneath is not "stop reading to me", and the transport has its own Stop.
   * The header button goes on saying that a reading is playing, and reopening
   * lands back on the live session.
   */
  closePlayer(): void {
    this.playerSentenceIdSignal.set(null);
    this.playerOpenSignal.set(false);
  }

  /** Ends both the card and the sound, for leaving the reading entirely. */
  endPlayback(): void {
    this.playback.stop();
    this.closePlayer();
  }

  /**
   * Reads aloud everything in the reading that has no clip for the current
   * voice. Asked of the preparation lane rather than the job itself, so the
   * reading is claimed first and no other tab reads the same sentences aloud
   * at the same time (ADR 0048).
   */
  start(): void {
    const id = this.readingId();
    if (id === null) return;
    this.maintenance.acknowledge();
    this.lane.startLayer(id, 'audio').catch((error: unknown) => {
      reportRejection(this.logger, error);
    });
  }

  /** Runs a failed audio run again, under the same claim as `start`. */
  retry(): void {
    this.start();
  }

  /** Puts a settled report away without asking for the work again. */
  dismiss(): void {
    if (this.decoderMissing()) this.decoderNoticeDismissed.set(true);
    const id = this.readingId();
    if (id !== null) this.job.acknowledge(id);
  }

  /** Acknowledges maintenance before a preparation request repeats the work. */
  acknowledgeMaintenance(): void {
    this.maintenance.acknowledge();
  }

  /** True while clearing, when asking to clear again would race the first. */
  readonly clearing = computed(() => this.maintenance.state() === 'clearing');

  /** Deletes only this reading's clips and jobs, then refreshes every local view. */
  async clear(reading: Reading): Promise<void> {
    await this.maintenance.clear(reading);
    this.job.acknowledge(reading.id);
    await this.reader.refreshSummaries();
  }

  /** Another tab deleted this reading: stop anything this one still owns. */
  readingDeleted(id: ReadingId): Promise<void> {
    return this.job.readingDeleted(id);
  }

  /** Points the store at the reading the route names. */
  setReading(id: ReadingId): void {
    this.readingIdSignal.set(id);
  }

  private readingId(): ReadingId | null {
    return this.readingIdSignal();
  }
}
