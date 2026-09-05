import { Injectable, computed, inject, signal } from '@angular/core';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingId, SentenceId } from '../../domain/shared/ids';
import { AudioPlaybackStore } from '../audio/audio-playback.store';
import { AudioConfigurationService } from '../enrichment/audio-configuration.service';
import { AudioJobStore } from '../enrichment/audio-job.store';
import { ReadingAudioMaintenanceStore } from '../enrichment/reading-audio-maintenance.store';
import { TtsStore } from '../settings/tts.store';
import { ReaderStore } from './reader.store';

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
  private readonly maintenance = inject(ReadingAudioMaintenanceStore);
  private readonly configuration = inject(AudioConfigurationService);
  readonly playback = inject(AudioPlaybackStore);
  readonly tts = inject(TtsStore);

  /**
   * The reading being read, which the page owns: the route names it before the
   * reading itself has loaded, and audio progress is asked for from that moment.
   */
  private readonly readingIdSignal = signal<ReadingId | null>(null);

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

  readonly progress = computed(() => {
    const id = this.readingIdSignal();
    return id === null ? this.job.idleProgress : this.job.progressFor(id);
  });

  readonly running = computed(() => {
    const kind = this.progress().kind;
    return kind === 'preparing' || kind === 'running';
  });

  /**
   * Whether generation would be refused for want of a configuration.
   *
   * Resolved through the same service the job itself gates on rather than
   * through saved presets: a tested model and voice with no preset saved is an
   * ordinary state, and it was being offered "Set up audio model" beside a
   * Generate button that worked perfectly.
   */
  readonly hasModel = computed(() => this.configuration.resolve('tts-synthesis').ok);

  /** Whether the voice settings name both halves a request needs. */
  readonly voiceChosen = computed(
    () => this.tts.settings().modelId !== '' && this.tts.settings().voiceId !== '',
  );

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
   * voice. The only whole-reading audio request, and it starts here.
   */
  start(): void {
    const id = this.readingId();
    if (id === null) return;
    this.maintenance.acknowledge();
    void this.job.start(id);
  }

  retry(): void {
    const id = this.readingId();
    if (id === null) return;
    this.maintenance.acknowledge();
    void this.job.retry(id);
  }

  /** Puts a settled report away without asking for the work again. */
  dismiss(): void {
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
