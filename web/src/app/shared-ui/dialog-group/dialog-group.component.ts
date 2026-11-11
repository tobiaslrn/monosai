import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextDialogGroupId = 0;

/**
 * A group of rows in a dialog, under its own label: the card of rows of a page
 * (`mn-section`), drawn where the dialog is already the surface. Its rows run
 * to the dialog's edges, with a hairline between them from the text edge, and
 * the group label sits on that same text edge.
 *
 *   <mn-dialog-group heading="Reading appearance">
 *     <mn-range-field label="Text size" … />
 *     <mn-switch-row [(checked)]="furigana">Furigana</mn-switch-row>
 *     <mn-status-line tone="warning">…</mn-status-line>
 *   </mn-dialog-group>
 *
 * A group with no label of its own names itself with `label`. What answers the
 * group as a whole — where it stands, and its fix — is one `mn-status-line`
 * after its rows.
 */
@Component({
  selector: 'mn-dialog-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="dialog-group"
      role="group"
      [attr.aria-labelledby]="heading() === null ? null : headingId"
      [attr.aria-label]="heading() === null ? label() : null"
    >
      @if (heading(); as text) {
        <h3 class="mn-group-title" [id]="headingId">{{ text }}</h3>
      }
      <div class="mn-settings-group mn-settings-bleed"><ng-content /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .dialog-group {
      display: flex;
      flex-direction: column;
      gap: var(--group-gap);
      min-width: 0;
    }

    h3 {
      margin: 0;
    }
  `,
})
export class DialogGroupComponent {
  /** The group label, on the canvas of the dialog. */
  readonly heading = input<string | null>(null);
  /** The accessible name of a group with no visible label. */
  readonly label = input<string | null>(null);
  protected readonly headingId = `mn-dialog-group-${String(nextDialogGroupId++)}-heading`;
}
