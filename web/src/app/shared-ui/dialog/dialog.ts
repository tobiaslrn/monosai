import type { Dialog, DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
}

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
    panelClass: 'mn-docked-pane',
    maxWidth: '100vw',
  });
}

/** Resolves with the dialog's answer, or `undefined` when it was dismissed. */
export function dialogResult<R>(ref: DialogRef<R, unknown>): Promise<R | undefined> {
  return new Promise((resolve) => {
    ref.closed.subscribe((value) => {
      resolve(value);
    });
  });
}

/**
 * The frame inside a dialog: its title, its body in one stack, and its actions
 * at the foot, ending at the inline end.
 *
 *   <mn-dialog heading="Delete everything?" headingId="mn-delete-title">
 *     <p id="mn-delete-message">…</p>
 *     <button mn-dialog-action mnButton type="button">Cancel</button>
 *     <button mn-dialog-action mnButton="danger" type="button">Delete</button>
 *   </mn-dialog>
 */
@Component({
  selector: 'mn-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 [id]="headingId()">{{ heading() }}</h2>
    <div class="body"><ng-content /></div>
    <div class="actions"><ng-content select="[mn-dialog-action]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      box-sizing: border-box;
      width: min(30rem, calc(100vw - 2 * var(--space-4)));
      max-height: calc(100dvh - 2 * var(--space-4));
      overflow-y: auto;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    h2 {
      margin: 0;
      overflow-wrap: anywhere;
      font-size: var(--text-xl);
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
      color: var(--text-secondary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
    }
    .actions:empty {
      display: none;
    }
    @media (max-width: 59.999em) {
      :host {
        width: 100%;
        max-height: 90vh;
        padding-block-end: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
        border-inline: 0;
        border-block-end: 0;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      }
    }
  `,
})
export class DialogComponent {
  readonly heading = input.required<string>();
  /** Named by the opener as `labelledBy`, so the dialog has its accessible name. */
  readonly headingId = input.required<string>();
}
