import type { TemplateRef, ViewContainerRef } from '@angular/core';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { PopoverService, type PopoverRef } from '../../shared-ui/popover/popover.service';
import type { SelectedWord, TokenActivation } from './reader-sentence.component';

/** How long a pointer must rest on a word before its preview appears. */
export const PREVIEW_DELAY_MS = 250;

/**
 * The concise hover preview of a word.
 *
 * Shown after a pause, so that sweeping the pointer across a line does not
 * flash a card per word. Suppressed while anything is open: the preview and a
 * pinned card share one floating surface, and a hover must never dismiss what
 * the learner deliberately opened.
 *
 * Provided by the reader page.
 */
@Injectable()
export class ReaderWordPreviewService {
  private readonly popover = inject(PopoverService);
  private readonly selection = inject(ReaderSelectionStore);

  /** The whole word currently under the pointer or keyboard focus. */
  private readonly wordSignal = signal<SelectedWord | null>(null);
  readonly word = this.wordSignal.asReadonly();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private ref: PopoverRef | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.end();
    });
  }

  show(
    activation: TokenActivation,
    template: TemplateRef<unknown>,
    viewContainerRef: ViewContainerRef,
  ): void {
    if (this.selection.anythingOpen()) {
      return;
    }
    this.wordSignal.set({
      sentenceId: activation.sentence.sentence.id,
      tokenId: activation.token.id,
    });
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.selection.previewWord(activation.word);
      this.ref = this.popover.open({
        origin: activation.origin,
        template,
        viewContainerRef,
        modal: false,
        onClosed: () => {
          this.ref = null;
        },
      });
    }, PREVIEW_DELAY_MS);
  }

  end(): void {
    this.cancelTimer();
    this.wordSignal.set(null);
    this.ref?.close();
    this.ref = null;
    this.selection.clearPreview();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
