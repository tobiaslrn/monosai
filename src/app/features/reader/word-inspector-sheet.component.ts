import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { WordInspectorComponent } from './word-inspector.component';

/**
 * Mobile presentation of the word inspector.
 *
 * The CDK dialog traps focus while it is open and restores focus to the token
 * button that opened it, which is what makes tapping a word and dismissing it
 * usable with a screen reader and an external keyboard.
 */
@Component({
  selector: 'mn-word-inspector-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WordInspectorComponent],
  template: `
    <div class="sheet">
      <h2 id="mn-word-sheet-title" class="mn-visually-hidden">Word details</h2>
      <mn-word-inspector (closed)="close()" />
    </div>
  `,
  styles: `
    .sheet {
      width: 100vw;
      max-width: 100%;
      max-height: 85dvh;
      padding: var(--space-4);
      overflow-y: auto;
      border-start-start-radius: var(--radius-card);
      border-start-end-radius: var(--radius-card);
      background: var(--surface-panel);
    }
  `,
})
export class WordInspectorSheetComponent {
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef);

  protected close(): void {
    this.dialogRef.close();
  }
}
