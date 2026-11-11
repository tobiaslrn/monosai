import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import type { ElementRef } from '@angular/core';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonDirective } from '../button/button';
import { DialogComponent, dialogResult, openDialog } from '../dialog/dialog';
import { FieldComponent } from '../field/field.component';

/** What a field dialog asks for: one typed value, with the rule that decides whether it may be kept. */
export interface FieldDialogRequest {
  /** The settings row's label: it titles the dialog. */
  readonly title: string;
  /** The field's label, above it. */
  readonly label: string;
  /** What is stored now; the field opens on it, selected. */
  readonly value: string;
  /** What to enter, until the entry is wrong. */
  readonly hint?: string;
  /** What the field is shown when it is empty. */
  readonly placeholder?: string;
  /** `numeric` brings up a number pad on a phone. */
  readonly inputMode?: 'text' | 'numeric';
  /** Why the entry cannot be kept, as one line, or null when it can. */
  readonly problem: (entry: string) => string | null;
  /** For durable tests: on the field. */
  readonly testId?: string;
}

/**
 * A typed value in Settings: one labelled field in a task dialog, opened from
 * a row that shows the value. The row holds no field; this does. The entry is
 * checked as it is typed, a problem is one danger line under the field that
 * replaces its hint, and the primary Save, at the end, keeps the value only
 * while there is none.
 */
@Component({
  selector: 'mn-field-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, DialogComponent, FieldComponent],
  template: `
    <form (submit)="save($event)">
      <mn-dialog [heading]="request.title" headingId="mn-field-dialog-title">
        <mn-field
          [label]="request.label"
          [hint]="request.hint ?? null"
          [hintId]="hintId"
          [error]="problem()"
          [errorId]="errorId"
        >
          <input
            #field
            class="mn-control"
            type="text"
            autocomplete="off"
            spellcheck="false"
            [attr.inputmode]="request.inputMode ?? 'text'"
            [attr.placeholder]="request.placeholder ?? null"
            [attr.data-testid]="request.testId ?? null"
            [attr.aria-invalid]="problem() !== null"
            [attr.aria-describedby]="problem() !== null ? errorId : hintId"
            [value]="entry()"
            (input)="onInput($event)"
          />
        </mn-field>

        <button mn-dialog-action mnButton="primary" type="submit" [disabled]="problem() !== null">
          Save
        </button>
      </mn-dialog>
    </form>
  `,
})
export class FieldDialogComponent {
  private readonly frame = viewChild.required(DialogComponent);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly request = inject<FieldDialogRequest>(DIALOG_DATA);

  protected readonly hintId = 'mn-field-dialog-hint';
  protected readonly errorId = 'mn-field-dialog-error';

  protected readonly entry = signal(this.request.value);
  protected readonly problem = computed(() => this.request.problem(this.entry()));

  constructor() {
    // Replacing the value outright is the common case, so it opens selected.
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
    if (this.problem() === null) {
      this.frame().close(this.entry().trim());
    }
  }
}

/** Opens the field dialog and resolves to the entry that was saved, or null when it was put away. */
export async function openFieldDialog(
  dialog: Dialog,
  request: FieldDialogRequest,
): Promise<string | null> {
  const ref = openDialog<string, FieldDialogRequest, FieldDialogComponent>(
    dialog,
    FieldDialogComponent,
    { data: request, modal: true, labelledBy: 'mn-field-dialog-title' },
  );
  return (await dialogResult(ref)) ?? null;
}
