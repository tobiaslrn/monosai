import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { LayerError } from '../../application/enrichment/layer-progress';
import { ReadingTextAidMaintenanceStore } from '../../application/enrichment/reading-text-aid-maintenance.store';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderStore } from '../../application/reading/reader.store';
import { PREPARATION_ORDER, type PreparationLayer } from '../../domain/enrichment/preparation';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { enrichmentCanRetry } from './enrichment-failure-copy';
import { readerContentState } from './reader-content-state';

/** How long a pressed credit link waits for the page to be left. */
const CREDIT_LEAVE_MS = 1000;

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
  /** The errors the open panel showed, by layer: what was seen, as opposed to what happened. */
  private readonly seen = new Map<'english' | 'grammar', LayerError>();
  private readonly menuOpen = signal(false);
  private creditStage: 'idle' | 'pressed' | 'away' = 'idle';
  /** The refusal whose credit link was followed: only that one is forgotten on return. */
  private pressed: { readonly layer: 'english' | 'grammar'; readonly error: LayerError } | null =
    null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const document = inject(DOCUMENT);
    const readingId = computed(() => this.store.reading()?.id ?? null);

    // A refusal that repeating cannot fix (a refused key) stays on its row until
    // the learner has seen it. Seeing it and leaving, for Settings or anywhere
    // else, is what ends it, so coming back finds the layer offered again. A
    // failure that arrived while the panel was shut is still unread and stays.
    // The cleanup runs when the story changes and when the page goes.
    effect((onCleanup) => {
      const id = readingId();
      if (id === null) return;
      onCleanup(() => {
        this.disarmCredit();
        for (const [layer, error] of this.seen) {
          const progress = this.preparation.progressFor(id, layer);
          if (
            progress.kind === 'failed' &&
            progress.error === error &&
            !enrichmentCanRetry(progress.error)
          ) {
            this.preparation.acknowledge(id, layer);
          }
        }
        this.seen.clear();
      });
    });
    effect(() => {
      const id = readingId();
      if (id === null || !this.menuOpen()) return;
      for (const row of this.rows()) {
        if (row.layer === 'audio' || row.error === null) continue;
        const progress = untracked(() => this.preparation.progressFor(id, row.layer));
        if (progress.kind === 'failed') this.seen.set(row.layer, progress.error);
      }
    });

    // Credit is added on another page. Coming back from it is the signal that
    // something may have changed, so the stop is forgotten and the row offers
    // the layer again; nothing is retried on its own.
    const left = () => {
      if (this.creditStage === 'pressed') this.creditStage = 'away';
    };
    const returned = () => {
      if (this.creditStage !== 'away') return;
      const pressed = this.pressed;
      this.disarmCredit();
      const id = readingId();
      if (id === null || pressed === null) return;
      const progress = this.preparation.progressFor(id, pressed.layer);
      if (
        progress.kind === 'failed' &&
        progress.error === pressed.error &&
        progress.error === this.seen.get(pressed.layer) &&
        progress.error.source === 'provider' &&
        progress.error.error.code === 'credit-exhausted'
      ) {
        this.preparation.acknowledge(id, pressed.layer);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') left();
      else returned();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', left);
    window.addEventListener('focus', returned);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', left);
      window.removeEventListener('focus', returned);
      this.disarmCredit();
    });
  }

  menuShown(open: boolean): void {
    this.menuOpen.set(open);
  }

  /**
   * The credit link of a layer's row was followed. Leaving this page is what
   * follows, so a press that sees no leave within a moment (a new background tab,
   * a blocked popup) is dropped rather than left to match a later blur.
   */
  creditOpened(layer: 'english' | 'grammar'): void {
    const id = this.store.reading()?.id ?? null;
    const progress = id === null ? null : this.preparation.progressFor(id, layer);
    this.disarmCredit();
    if (progress?.kind !== 'failed') return;
    this.pressed = { layer, error: progress.error };
    this.creditStage = 'pressed';
    this.pressTimer = setTimeout(() => {
      if (this.creditStage === 'pressed') this.disarmCredit();
    }, CREDIT_LEAVE_MS);
  }

  private disarmCredit(): void {
    this.creditStage = 'idle';
    this.pressed = null;
    if (this.pressTimer !== null) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

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
