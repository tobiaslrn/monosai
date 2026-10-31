import { Dialog } from '@angular/cdk/dialog';
import { Injectable, computed, inject } from '@angular/core';
import { ReadingTextAidMaintenanceStore } from '../../application/enrichment/reading-text-aid-maintenance.store';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderStore } from '../../application/reading/reader.store';
import { PREPARATION_ORDER, type PreparationLayer } from '../../domain/enrichment/preparation';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { readerContentState } from './reader-content-state';

/**
 * What the reader's menu says about a reading's content, and what it commands:
 * preparing a layer, stopping one, and the destructive actions behind a
 * confirmation.
 *
 * Provided by the reader page.
 */
@Injectable()
export class ReaderContentActionsService {
  private readonly store = inject(ReaderStore);
  private readonly preparation = inject(ReaderPreparationStore);
  private readonly textAidMaintenance = inject(ReadingTextAidMaintenanceStore);
  private readonly audio = inject(ReaderAudioStore);
  private readonly dialog = inject(Dialog);

  readonly pending = computed(
    () => this.textAidMaintenance.pending() ?? this.preparation.pending(),
  );
  readonly error = computed(
    () => this.textAidMaintenance.error()?.message ?? this.preparation.lastError(),
  );
  /** The only part of preparation that is about this page: what a menu draws. */
  readonly rows = computed(() => {
    const reading = this.store.reading();
    return reading === null
      ? []
      : PREPARATION_ORDER.map((layer) =>
          readerContentState(
            reading,
            layer,
            this.preparation.progressFor(reading.id, layer),
            this.preparation.readiness(layer),
            this.preparation.online(),
          ),
        );
  });
  readonly savedTextLayers = computed<readonly PreparationLayer[]>(() => {
    const reading = this.store.reading();
    if (reading === null) return [];
    return [
      ...(reading.translationSummary.completed > 0 ? (['english'] as const) : []),
      ...(reading.grammarSummary.state === 'partial' || reading.grammarSummary.state === 'complete'
        ? (['grammar'] as const)
        : []),
    ];
  });

  /** An explicit request fills the missing content with the current settings. */
  prepare(layer: PreparationLayer): void {
    const row = this.rows().find((entry) => entry.layer === layer);
    if (row?.action !== 'prepare' || row.disabled) return;
    if (layer === 'audio') this.audio.acknowledgeMaintenance();
    this.preparation.prepare(layer);
  }

  async stop(layer: PreparationLayer): Promise<void> {
    await this.preparation.stop(layer);
  }

  /** Confirms the destructive reading-level action selected from the More menu. */
  async confirmClearAudio(): Promise<void> {
    const reading = this.store.reading();
    if (reading === null || this.audio.clearing()) {
      return;
    }
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete audio for this story?',
      message: 'This permanently deletes every generated audio clip for this reading.',
      details: ['The story, translations, and grammar results stay saved.'],
      footnote: 'You can generate the audio again from scratch.',
      confirmLabel: 'Delete audio',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (confirmed) {
      await this.audio.clear(reading);
    }
  }

  async confirmClearTextAid(layer: 'english' | 'grammar'): Promise<void> {
    if (this.textAidMaintenance.pending() !== null) return;
    const grammar = layer === 'grammar';
    const noun = grammar ? 'grammar notes' : 'translation';
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Clear ${noun} for this reading?`,
      message: `This permanently deletes the saved ${noun} for this reading.`,
      details: ['The Japanese text and its other reading aids stay saved.'],
      footnote: `You can prepare ${grammar ? 'the notes' : 'a translation'} again from scratch.`,
      confirmLabel: grammar ? 'Clear grammar notes' : 'Clear translation',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (confirmed) await this.textAidMaintenance.clear(layer);
  }
}
