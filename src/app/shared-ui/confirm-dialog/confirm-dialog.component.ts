import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

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
  template: `
    <div class="dialog">
      <h2 id="mn-confirm-title">{{ data.title }}</h2>
      <p id="mn-confirm-message">{{ data.message }}</p>

      @if (data.details?.length) {
        <ul>
          @for (detail of data.details; track detail) {
            <li>{{ detail }}</li>
          }
        </ul>
      }

      @if (data.footnote) {
        <p class="footnote">{{ data.footnote }}</p>
      }

      <div class="actions">
        <button type="button" class="mn-button" (click)="cancel()">{{ data.cancelLabel }}</button>
        <button
          type="button"
          class="mn-button"
          [class.mn-button--danger]="data.tone === 'danger'"
          [class.mn-button--primary]="data.tone !== 'danger'"
          cdkFocusInitial
          (click)="confirm()"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .dialog {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: min(30rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    h2 {
      margin: 0;
      font-size: 20px;
    }

    p {
      margin: 0;
      color: var(--text-secondary);
    }

    ul {
      margin: 0;
      padding-inline-start: var(--space-5);
      color: var(--text-secondary);
    }

    .footnote {
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
      margin-top: var(--space-2);
    }
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
  const ref = dialog.open<boolean, ConfirmDialogData>(ConfirmDialogComponent, {
    data,
    role: 'alertdialog',
    ariaLabelledBy: 'mn-confirm-title',
    ariaDescribedBy: 'mn-confirm-message',
    hasBackdrop: true,
  });
  const result = await new Promise<boolean | undefined>((resolve) => {
    ref.closed.subscribe((value) => {
      resolve(value);
    });
  });
  return result === true;
}
