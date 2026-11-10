import type { Dialog } from '@angular/cdk/dialog';
import { DialogRef } from '@angular/cdk/dialog';
import { hasModifierKey } from '@angular/cdk/keycodes';
import type { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { SheetHandleComponent } from '../sheet/sheet-handle.component';
import { OverlayHeaderComponent } from './overlay-header.component';

export interface DialogOptions<D> {
  readonly data: D;
  /**
   * A modal dialog stops the page: it draws the scrim, and a press on the scrim
   * does nothing a modal would not. A non-modal one leaves the page visible
   * and pressable around it.
   */
  readonly modal: boolean;
  /** `alertdialog` for a confirmation or a notice that needs an answer. */
  readonly role?: 'dialog' | 'alertdialog';
  readonly labelledBy: string;
  readonly describedBy?: string;
  /** Escape and the scrim do not close it; only its own answer does. */
  readonly requireAnswer?: boolean;
  /**
   * Whether it docks to a phone's bottom edge (the default). A dialog whose
   * text field must stay above the on-screen keyboard stays a centred card.
   */
  readonly docks?: boolean;
}

/** The pane class of a dialog that stays a centred card at every width. */
const FLOATING_PANE = 'mn-floating-pane';
/** Longer than the departure, so a missed `transitionend` still closes the dialog. */
const DEPARTURE_FALLBACK_MS = 400;

/**
 * Opens a dialog in the one way the app has: a centred card on a wide screen
 * and a sheet docked to the bottom edge on a phone, with the scrim only when
 * it is modal. The CDK traps focus inside it and returns focus to the control
 * that opened it.
 */
export function openDialog<R, D, C>(
  dialog: Dialog,
  component: ComponentType<C>,
  options: DialogOptions<D>,
): DialogRef<R, C> {
  return dialog.open<R, D, C>(component, {
    data: options.data,
    role: options.role ?? 'dialog',
    ariaLabelledBy: options.labelledBy,
    ariaDescribedBy: options.describedBy ?? null,
    ariaModal: options.modal,
    hasBackdrop: options.modal,
    disableClose: options.requireAnswer ?? false,
    panelClass: options.docks === false ? FLOATING_PANE : 'mn-docked-pane',
    maxWidth: '100vw',
  });
}

/** Resolves with the dialog's answer, or `undefined` when it was dismissed. */
export function dialogResult<R, C>(ref: DialogRef<R, C>): Promise<R | undefined> {
  return new Promise((resolve) => {
    ref.closed.subscribe((value) => {
      resolve(value);
    });
  });
}

/**
 * The frame inside a CDK dialog: the shared overlay surface (`_overlay.scss`)
 * with its header, its body in one stack, and its actions at the foot.
 *
 *   <mn-dialog heading="Filters" headingId="filters-title" closeLabel="Close filters">
 *     <label class="mn-field">…</label>
 *     <button mn-dialog-action="start" mnButton="ghost" type="button">Reset</button>
 *     <button mn-dialog-action mnButton="primary" type="button" (click)="frame.close(draft)">
 *       Show
 *     </button>
 *   </mn-dialog>
 *
 * The actions end at the inline end, the primary written last; one marked
 * `mn-dialog-action="start"` goes to the far start.
 *
 * `kind` is what the dialog is:
 *
 *   task      a form or a task. A close in the header on a wide viewport; on a
 *             phone it is a sheet with a grab handle.
 *   confirm   a confirmation or a notice: its own answers are its only ways
 *             out besides Escape and the scrim, so it has neither a close nor a
 *             handle.
 *
 * However either is put away — the close, the handle, the scrim, Escape, or
 * its own answer through `close()` — it leaves first: a centred card shrinks
 * back into the page and a docked sheet slides down its edge, and the dialog
 * then closes with the result. A dialog's own answers therefore go through
 * `close()` on this frame, never straight to the `DialogRef`.
 */
@Component({
  selector: 'mn-dialog',
  exportAs: 'mnDialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayHeaderComponent, SheetHandleComponent],
  host: {
    class: 'mn-overlay mn-overlay--dialog',
    '[class.mn-overlay--docked]': 'docked()',
    '[class.is-dragging]': 'dragOffset() > 0 && !leaving()',
    '[class.is-leaving]': 'leaving()',
    '[style.transform]': 'leaving() ? null : dragTransform()',
    '(transitionend)': 'onTransitionEnd($event)',
  },
  template: `
    @if (docked() && kind() === 'task') {
      <mn-sheet-handle #handle [label]="closeLabel()" (dismissed)="dismiss()" />
    }
    <mn-overlay-header
      [heading]="heading()"
      [headingId]="headingId()"
      [backLabel]="backLabel()"
      [closeLabel]="kind() === 'task' && !docked() ? closeLabel() : null"
      (back)="back.emit()"
      (dismissed)="dismiss()"
    />
    <div class="mn-overlay__pinned"><ng-content select="[mn-dialog-pinned]" /></div>
    <div class="mn-overlay__body"><ng-content /></div>
    <div class="mn-overlay__footer"><ng-content select="[mn-dialog-action]" /></div>
  `,
  styles: `
    @use '../../../styles/motion' as motion;
    /* Let go mid-drag, a docked sheet settles back to its edge. */
    :host {
      @include motion.settle;
    }

    /* Arriving: a centred card grows in over the page; a docked sheet rises. */
    :host(:not(.mn-overlay--docked)) {
      @include motion.dialog-enter;
    }

    :host(.mn-overlay--docked) {
      @include motion.sheet-enter;
    }

    :host(.is-dragging) {
      transition: none;
    }

    /* Leaving, it is no longer a surface to press. */
    :host(.is-leaving) {
      pointer-events: none;
    }

    /* Leaving accelerates away: a centred card shrinks back, a docked sheet slides down. */
    :host(.is-leaving:not(.mn-overlay--docked)) {
      @include motion.dialog-leave;
    }

    :host(.mn-overlay--docked.is-leaving) {
      @include motion.sheet-leave;
    }
  `,
})
export class DialogComponent implements OnInit {
  readonly heading = input.required<string>();
  /** Named by the opener as `labelledBy`, so the dialog has its accessible name. */
  readonly headingId = input.required<string>();
  readonly kind = input<'task' | 'confirm'>('task');
  /** Names the back arrow of a step below the first; without one there is none. */
  readonly backLabel = input<string | null>(null);
  /** Names the close on a wide viewport and the grab handle when docked. */
  readonly closeLabel = input('Close');
  readonly back = output<void>();

  private readonly ref = inject<DialogRef<unknown>>(DialogRef, { optional: true });
  private readonly viewport = inject(ViewportService);
  private readonly handle = viewChild<SheetHandleComponent>('handle');
  private readonly docks = !(this.ref?.config.panelClass ?? '').includes(FLOATING_PANE);
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private result: unknown;

  protected readonly docked = computed(() => this.docks && this.viewport.isMobile());
  /** Set once a dismissal has begun, so a second one during the slide is ignored. */
  protected readonly leaving = signal(false);
  protected readonly dragOffset = computed(() => this.handle()?.offset() ?? 0);
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.fallback);
    });
  }

  ngOnInit(): void {
    const ref = this.ref;
    if (ref === null || ref.disableClose) {
      return;
    }
    // The dialog would remove the surface the moment it closed. Taking over
    // backdrop and Escape dismissal lets the surface depart before it does.
    ref.disableClose = true;
    ref.backdropClick.subscribe(() => {
      this.dismiss();
    });
    ref.keydownEvents.subscribe((event) => {
      if (event.key === 'Escape' && !hasModifierKey(event)) {
        event.preventDefault();
        this.dismiss();
      }
    });
  }

  /** Puts the dialog away without an answer. */
  dismiss(): void {
    this.close(undefined);
  }

  /**
   * Closes the dialog with `result`. The surface leaves first — a centred card
   * shrinks back, a docked sheet slides down its edge — and a second close
   * while it is leaving is ignored.
   */
  close(result: unknown): void {
    if (this.leaving()) {
      return;
    }
    this.result = result;
    if (this.viewport.prefersReducedMotion()) {
      this.finish();
      return;
    }
    this.leaving.set(true);
    this.ref?.overlayRef.backdropElement?.classList.add('is-leaving');
    // A transition that never runs (a hidden tab) must not strand the dialog.
    this.fallback = setTimeout(() => {
      this.finish();
    }, DEPARTURE_FALLBACK_MS);
  }

  /** The handle springing back also ends a slide; only the slide away closes. */
  protected onTransitionEnd(event: TransitionEvent): void {
    if (
      this.leaving() &&
      event.target === event.currentTarget &&
      event.propertyName === 'transform'
    ) {
      this.finish();
    }
  }

  private finish(): void {
    clearTimeout(this.fallback);
    this.ref?.close(this.result);
  }
}
