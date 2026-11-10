import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ButtonDirective } from '../button/button';
import { DialogComponent, openDialog, dialogResult } from '../dialog/dialog';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  /** Bullet points shown above the actions, such as what deletion removes. */
  readonly details?: readonly string[];
  readonly footnote?: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tone: 'danger' | 'neutral';
}

/**
 * Confirmation for an action that would lose work or delete data.
 *
 * The CDK dialog traps focus and restores it to the element that opened it, and
 * Escape cancels — cancelling is always the safe outcome here, so Escape never
 * destroys anything.
 */
@Component({
  selector: 'mn-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, DialogComponent],
  template: `
    <mn-dialog kind="confirm" [heading]="data.title" headingId="mn-confirm-title">
      <p id="mn-confirm-message">{{ data.message }}</p>

      @if (data.details?.length) {
        <ul>
          @for (detail of data.details; track detail) {
            <li>{{ detail }}</li>
          }
        </ul>
      }

      @if (data.footnote) {
        <p class="mn-hint">{{ data.footnote }}</p>
      }

      <button mn-dialog-action mnButton type="button" cdkFocusInitial (click)="cancel()">
        {{ data.cancelLabel }}
      </button>
      <button
        mn-dialog-action
        type="button"
        [mnButton]="data.tone === 'danger' ? 'danger' : 'primary'"
        (click)="confirm()"
      >
        {{ data.confirmLabel }}
      </button>
    </mn-dialog>
  `,
})
export class ConfirmDialogComponent {
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}

/** Opens the confirmation and resolves to what the learner chose. */
export async function openConfirmDialog(dialog: Dialog, data: ConfirmDialogData): Promise<boolean> {
  const ref = openDialog<boolean, ConfirmDialogData, ConfirmDialogComponent>(
    dialog,
    ConfirmDialogComponent,
    {
      data,
      modal: true,
      role: 'alertdialog',
      labelledBy: 'mn-confirm-title',
      describedBy: 'mn-confirm-message',
    },
  );
  const result = await dialogResult(ref);
  return result === true;
}
