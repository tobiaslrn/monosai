import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ButtonDirective } from '../button/button';
import { DialogComponent } from '../dialog/dialog';
import { NoticeComponent } from '../notice/notice.component';

export interface AlphaNoticeDialogData {
  readonly acknowledge: () => Promise<boolean>;
}

/** The one-time startup disclosure for the current alpha release. */
@Component({
  selector: 'mn-alpha-notice-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, DialogComponent, NoticeComponent],
  template: `
    <mn-dialog kind="confirm" heading="Monosai is in alpha." headingId="mn-alpha-title">
      <p id="mn-alpha-message">
        It is still being built, so you may encounter bugs, missing features, or changes.
      </p>

      @if (saveFailed()) {
        <mn-notice tone="error" role="alert">
          <p>Could not save your acknowledgment. Try again.</p>
        </mn-notice>
      }

      <button
        mn-dialog-action
        mnButton="primary"
        type="button"
        cdkFocusInitial
        [disabled]="saving()"
        [attr.aria-busy]="saving()"
        (click)="continue()"
      >
        Continue
      </button>
    </mn-dialog>
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
