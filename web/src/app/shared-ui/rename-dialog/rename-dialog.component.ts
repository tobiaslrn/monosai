import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { MAXIMUM_TITLE_LENGTH, renamedTitle } from '../../domain/reading/import-title';

export interface RenameDialogData {
  /** The title being replaced, which the field opens on and preselects. */
  readonly currentTitle: string;
}

/**
 * Renaming a reading.
 *
 * The field opens on the current title with it selected, so the common case —
 * replacing a pasted reading's auto-derived title outright — is one keystroke
 * away. What may be saved is decided by the domain rule rather than here, and
 * Save stays unavailable until the entry names something.
 */
@Component({
  selector: 'mn-rename-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" (submit)="save($event)">
      <h2 id="mn-rename-title">Rename story</h2>
      <div class="mn-field">
        <label for="mn-rename-input">Title</label>
        <input
          #field
          id="mn-rename-input"
          type="text"
          lang="ja"
          autocomplete="off"
          [attr.maxlength]="maximumLength"
          [value]="entry()"
          (input)="onInput($event)"
        />
        <p class="mn-hint" id="mn-rename-message">
          Only the name changes. The story, its analyses, and its aids stay as they are.
        </p>
      </div>

      <div class="actions">
        <button type="button" class="mn-button" (click)="cancel()">Keep current name</button>
        <button type="submit" class="mn-button mn-button--primary" [disabled]="!canSave()">
          Save name
        </button>
      </div>
    </form>
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

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
      margin-top: var(--space-2);
    }
  `,
})
export class RenameDialogComponent {
  private readonly dialogRef = inject<DialogRef<string | null>>(DialogRef);
  private readonly data = inject<RenameDialogData>(DIALOG_DATA);

  protected readonly maximumLength = MAXIMUM_TITLE_LENGTH;
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly entry = signal(this.data.currentTitle);
  protected readonly canSave = computed(() => renamedTitle(this.entry()) !== null);

  constructor() {
    // Replacing the name outright is the common case — a pasted reading is
    // titled with its own first sentence — so the current one opens selected.
    afterNextRender(() => {
      const field = this.field().nativeElement;
      field.focus();
      field.select();
    });
  }

  protected onInput(event: Event): void {
    this.entry.set((event.target as HTMLInputElement).value);
  }

  protected save(event: Event): void {
    event.preventDefault();
    const title = renamedTitle(this.entry());
    if (title !== null) {
      this.dialogRef.close(title);
    }
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}

/** Opens the rename field and resolves to the new title, or null if cancelled. */
export async function openRenameDialog(
  dialog: Dialog,
  data: RenameDialogData,
): Promise<string | null> {
  const ref = dialog.open<string | null, RenameDialogData>(RenameDialogComponent, {
    data,
    ariaLabelledBy: 'mn-rename-title',
    ariaDescribedBy: 'mn-rename-message',
    hasBackdrop: true,
  });
  const result = await new Promise<string | null | undefined>((resolve) => {
    ref.closed.subscribe((value) => {
      resolve(value);
    });
  });
  return result ?? null;
}
