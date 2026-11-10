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
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ButtonDirective } from '../button/button';
import { DialogComponent, dialogResult, openDialog } from '../dialog/dialog';
import { FieldComponent } from '../field/field.component';
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
  imports: [ButtonDirective, DialogComponent, FieldComponent],
  template: `
    <form (submit)="save($event)">
      <mn-dialog heading="Rename story" headingId="mn-rename-title">
        <mn-field label="Title">
          <input
            #field
            id="mn-rename-input"
            class="mn-control"
            type="text"
            lang="ja"
            autocomplete="off"
            [attr.maxlength]="maximumLength"
            [value]="entry()"
            (input)="onInput($event)"
          />
        </mn-field>

        <button mn-dialog-action mnButton="primary" type="submit" [disabled]="!canSave()">
          Save name
        </button>
      </mn-dialog>
    </form>
  `,
})
export class RenameDialogComponent {
  private readonly frame = viewChild.required(DialogComponent);
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
      this.frame().close(title);
    }
  }
}

/** Opens the rename field and resolves to the new title, or null if cancelled. */
export async function openRenameDialog(
  dialog: Dialog,
  data: RenameDialogData,
): Promise<string | null> {
  // The field must stay above the on-screen keyboard, so this one never docks.
  const ref = openDialog<string | null, RenameDialogData, RenameDialogComponent>(
    dialog,
    RenameDialogComponent,
    { data, modal: true, labelledBy: 'mn-rename-title', docks: false },
  );
  const result = await dialogResult(ref);
  return result ?? null;
}
