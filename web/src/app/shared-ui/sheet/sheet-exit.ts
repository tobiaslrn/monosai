import type { FocusOrigin } from '@angular/cdk/a11y';
import { DialogRef } from '@angular/cdk/dialog';
import { hasModifierKey } from '@angular/cdk/keycodes';
import { afterNextRender, inject, Injector, signal, type Signal } from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';

/** The class the departing scrim wears; `styles.scss` draws its fade. */
const LEAVING_CLASS = 'is-leaving';

/** What a sheet built on a CDK dialog is closed through. */
export interface SheetExit<R> {
  /** True from the moment the sheet is sent away until the dialog is gone. */
  readonly leaving: Signal<boolean>;
  /**
   * Plays the sheet's departure, then closes the dialog with the result.
   *
   * Every way out of the sheet goes through here — its own actions, its
   * handle, `Escape`, and a press on the backdrop — so each ends the same way.
   * Asking again while it is leaving does nothing.
   */
  close(result?: R, focusOrigin?: FocusOrigin): void;
}

type Phase = 'open' | 'leaving' | 'closed';

function animationsOf(element: Element | null): readonly Animation[] {
  // Not every environment can list animations (the unit environment cannot).
  const read = (element as { getAnimations?: Element['getAnimations'] } | null)?.getAnimations;
  return typeof read === 'function' ? read.call(element) : [];
}

/**
 * Holds a CDK dialog open while its sheet leaves, then closes it.
 *
 * A dialog's element is removed the moment it closes, so a sheet built on one
 * could only be cut away, where a popover sheet goes back down the edge it
 * rose from. The sheet instead animates itself out first — in CSS, from
 * `leaving` — and the dialog is asked to close only once that has finished.
 *
 * `Escape` and the backdrop are taken over from the dialog (which would close
 * at once) and routed here. Focus is the dialog's own: it is restored to the
 * control that opened the sheet when the dialog finally closes, with the
 * origin of whatever asked for the close.
 */
export class SheetDialogExit<R> implements SheetExit<R> {
  private readonly leavingState = signal(false);
  readonly leaving = this.leavingState.asReadonly();

  private phase: Phase = 'open';

  constructor(
    private readonly ref: DialogRef<R>,
    /** The element that carries the departure: the surface that slides away. */
    private readonly surface: () => HTMLElement | null | undefined,
    private readonly reducedMotion: () => boolean,
    private readonly injector: Injector,
  ) {
    // The dialog would close on these at once, with nothing left to animate.
    ref.disableClose = true;
    ref.keydownEvents.subscribe((event) => {
      if (event.key === 'Escape' && !hasModifierKey(event)) {
        event.preventDefault();
        this.close(undefined, 'keyboard');
      }
    });
    ref.backdropClick.subscribe(() => {
      this.close(undefined, 'mouse');
    });
    // A route change or a closed owner disposes the dialog on its own: whatever
    // was waiting on the departure has nothing left to close.
    ref.closed.subscribe({
      complete: () => {
        this.phase = 'closed';
      },
    });
  }

  close(result?: R, focusOrigin?: FocusOrigin): void {
    if (this.phase !== 'open') {
      return;
    }
    const surface = this.surface() ?? null;
    if (surface === null || this.reducedMotion()) {
      this.finish(result, focusOrigin);
      return;
    }
    this.phase = 'leaving';
    this.ref.overlayRef.backdropElement?.classList.add(LEAVING_CLASS);
    this.leavingState.set(true);
    // The sheet writes its leaving state with the next render, and a transition
    // only exists once that has been styled: ask for the animations after it.
    afterNextRender(
      () => {
        const gone = [surface, this.ref.overlayRef.backdropElement].flatMap((element) =>
          animationsOf(element).map((animation) => animation.finished),
        );
        // A cancelled animation settles too, so nothing here can hang or throw.
        void Promise.allSettled(gone).then(() => {
          this.finish(result, focusOrigin);
        });
      },
      { injector: this.injector },
    );
  }

  private finish(result: R | undefined, focusOrigin: FocusOrigin | undefined): void {
    if (this.phase === 'closed') {
      return;
    }
    this.phase = 'closed';
    this.ref.close(result, focusOrigin === undefined ? undefined : { focusOrigin });
  }
}

/**
 * The close sequencing for a sheet that is the content of a CDK dialog.
 *
 * Call it once, in the sheet's injection context, and close through the result
 * instead of `DialogRef.close`. The `surface` is the element whose own
 * transform and transition carry the departure; it is read when a close is
 * asked for, so it may be a view query.
 */
export function injectSheetExit<R>(surface: () => HTMLElement | null | undefined): SheetExit<R> {
  const viewport = inject(ViewportService);
  return new SheetDialogExit<R>(
    inject<DialogRef<R>>(DialogRef),
    surface,
    () => viewport.prefersReducedMotion(),
    inject(Injector),
  );
}
