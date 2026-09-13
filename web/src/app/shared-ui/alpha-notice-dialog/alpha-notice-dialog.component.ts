import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface AlphaNoticeDialogData {
  readonly acknowledge: () => Promise<boolean>;
}

/** The one-time startup disclosure for the current alpha release. */
@Component({
  selector: 'mn-alpha-notice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog">
      <h2 id="mn-alpha-title">Monosai is in alpha.</h2>
      <p id="mn-alpha-message">
        It is still being built, so you may encounter bugs, missing features, or changes.
      </p>

      @if (saveFailed()) {
        <p class="mn-notice mn-notice--error" role="alert">
          Could not save your acknowledgment. Try again.
        </p>
      }

      <div class="mn-actions mn-actions--end">
        <button
          type="button"
          class="mn-button mn-button--primary"
          cdkFocusInitial
          [disabled]="saving()"
          [attr.aria-busy]="saving()"
          (click)="continue()"
        >
          Continue
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

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: var(--text-xl);
    }

    #mn-alpha-message {
      color: var(--text-secondary);
    }
  `,
})
export class AlphaNoticeDialogComponent {
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef);
  private readonly data = inject<AlphaNoticeDialogData>(DIALOG_DATA);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);

  protected async continue(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveFailed.set(false);
    const saved = await this.data.acknowledge();
    this.saving.set(false);
    if (saved) {
      this.dialogRef.close();
    } else {
      this.saveFailed.set(true);
    }
  }
}
