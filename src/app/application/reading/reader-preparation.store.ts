import { Injectable, computed, inject, signal } from '@angular/core';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { ReadingId } from '../../domain/shared/ids';
import { PreparationStore } from '../enrichment/preparation.store';
import { TranslationJobStore } from '../enrichment/translation-job.store';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { LanguageStore } from '../language/language.store';
import { TextModelStore } from '../settings/text-model.store';
import { TtsStore } from '../settings/tts.store';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { ReaderStore } from './reader.store';

/**
 * The open reading's aids: what exists, what is being made, and what would stop.
 *
 * The reader page was holding five collaborators to answer one question per aid
 * — the whole-reading translation job, the preparation lane, the text model's
 * readiness, the voice's readiness, and whether there is a network — plus the
 * two failure strings a stop can produce. That is one concern, and none of it
 * is about the page.
 *
 * What stays in the component is the projection: turning a reading, a progress,
 * a readiness, and a connection into the row a menu draws.
 *
 * Provided by the reader, because "the open reading" is what every answer here
 * is relative to. The lane itself is application-wide and is not.
 */
@Injectable()
export class ReaderPreparationStore {
  private readonly reader = inject(ReaderStore);
  private readonly lane = inject(PreparationStore);
  private readonly translation = inject(TranslationJobStore);
  private readonly textModel = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);
  private readonly network = inject(NETWORK_STATUS);

  private readonly readingIdSignal = signal<ReadingId | null>(null);
  private readonly pendingSignal = signal<PreparationLayer | null>(null);
  private readonly errorSignal = signal<string | null>(null);

  /** The layer a stop request is in flight for, which blocks a second one. */
  readonly pending = this.pendingSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  readonly online = computed(() => this.network.isOnline());

  readonly hasTranslationModel = computed(() => this.textModel.hasModelForTask('translation'));
  readonly hasGrammarModel = computed(() => this.textModel.hasModelForTask('grammar'));

  readonly translationProgress = computed(() => {
    const id = this.readingIdSignal();
    return id === null ? this.translation.idleProgress : this.translation.progressFor(id);
  });

  constructor() {
    // The profile a reading's grammar is judged against, and the bundle that
    // profile resolves against. Both are already started at bootstrap; asking
    // again is idempotent and keeps a reading opened straight after startup
    // from showing an unresolved profile.
    void this.grammarProfile.load();
    void this.language.initialize();
  }

  /** The configuration a layer is gated on: a voice for audio, a text model otherwise. */
  readiness(layer: PreparationLayer): ConfigurationReadiness {
    return layer === 'audio' ? this.tts.readiness() : this.textModel.readiness();
  }

  progressFor(readingId: ReadingId, layer: PreparationLayer) {
    return this.lane.progressFor(readingId, layer);
  }

  /** Whether the lane is doing anything at all for this reading's grammar. */
  grammarRunning(): boolean {
    const id = this.readingIdSignal();
    return id !== null && this.lane.progressFor(id, 'grammar').kind !== 'idle';
  }

  /**
   * Opening a reader is one of the four moments that create preparation work
   * (ADR 0047): whatever this reading declares and has never been given is
   * queued, and the lane works it — this reading first, because it is the one
   * being read.
   */
  async openedReading(id: ReadingId): Promise<void> {
    this.readingIdSignal.set(id);
    const reading = this.reader.reading();
    if (reading === null) {
      return;
    }
    this.lane.setOpenReading(id);
    await this.lane.reconcile(reading);
  }

  /** The reader is gone, so the lane no longer prioritises anything for it. */
  leftReader(): void {
    this.readingIdSignal.set(null);
    this.lane.setOpenReading(null);
  }

  /** An explicit request fills the missing content with the current settings. */
  prepare(layer: PreparationLayer): void {
    const id = this.readingIdSignal();
    if (id === null) return;
    this.errorSignal.set(null);
    void this.lane.retry(id, layer);
  }

  /**
   * Stops a layer by withdrawing the reading's declaration of it first.
   *
   * The order matters: a lane that is stopped while the reading still declares
   * the layer picks it up again on the next reconcile. Neither failure loses
   * anything, so both are reported as something to try again.
   */
  async stop(layer: PreparationLayer): Promise<void> {
    const reading = this.reader.reading();
    if (reading === null || this.pendingSignal() !== null) return;
    this.pendingSignal.set(layer);
    this.errorSignal.set(null);
    try {
      await this.reader.setPreparationTargets(
        reading.preparationTargets.filter((target) => target !== layer),
      );
      if (this.reader.lastError() !== null) {
        this.errorSignal.set(
          'Could not save the stop request. Try again. Saved content is unchanged.',
        );
        return;
      }
      const stopped = await this.lane.stopLayer(reading.id, layer);
      if (!stopped.ok) {
        this.errorSignal.set(`Could not stop preparation: ${stopped.error.message}`);
      }
      await this.reader.refreshSummaries();
    } finally {
      this.pendingSignal.set(null);
    }
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  /** Whether a whole-reading translation is running, for a deletion warning. */
  translationRunningFor(readingId: ReadingId): boolean {
    return this.translation.isRunningFor(readingId);
  }

  /** Another tab deleted this reading: stop anything this one still owns. */
  readingDeleted(readingId: ReadingId): Promise<void> {
    return this.translation.readingDeleted(readingId);
  }
}
