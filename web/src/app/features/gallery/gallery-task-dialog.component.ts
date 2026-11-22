import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ButtonDirective } from '../../shared-ui/button/button';
import { CheckboxComponent } from '../../shared-ui/checkbox/checkbox.component';
import { DialogComponent } from '../../shared-ui/dialog/dialog';
import { FieldComponent } from '../../shared-ui/field/field.component';

/** A task dialog as the app draws one: a form, a danger ghost at the start, the primary at the end. */
@Component({
  selector: 'mn-gallery-task-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, CheckboxComponent, DialogComponent, FieldComponent],
  template: `
    <mn-dialog heading="Edit word list" headingId="mn-gallery-task-title">
      <mn-field label="List name" hint="Shown in your word sources">
        <input type="text" value="Genki vocabulary" />
      </mn-field>
      <mn-field label="Words">
        <textarea rows="4">cat&#10;to eat&#10;good morning</textarea>
      </mn-field>
      <mn-checkbox [(checked)]="keepOrder">Keep this order</mn-checkbox>
      <button
        mn-dialog-action="start"
        mnButton="ghost"
        tone="danger"
        type="button"
        (click)="frame().dismiss()"
      >
        Delete list
      </button>
      <button mn-dialog-action mnButton="primary" type="button" (click)="frame().close(true)">
        Save list
      </button>
    </mn-dialog>
  `,
})
export class GalleryTaskDialogComponent {
  protected readonly frame = viewChild.required(DialogComponent);
  protected readonly keepOrder = signal(true);
}
