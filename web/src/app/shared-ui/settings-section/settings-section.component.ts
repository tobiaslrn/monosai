import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextSettingsSectionId = 0;

/**
 * The shared section frame for the settings-like pages.
 *
 * A group label sits on the canvas, inset to the text edge of the rows below it, and the related content sits in one card. The
 * optional action slot keeps a section action beside its heading without
 * making every caller recreate the same accessible section structure.
 */
@Component({
  selector: 'mn-settings-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mn-settings-section group"
      [id]="sectionId()"
      [attr.aria-labelledby]="headingId"
    >
      <header class="mn-settings-section__header">
        <h2 class="mn-group-title" [id]="headingId">{{ heading() }}</h2>
        <div class="mn-settings-section__action mn-trailing">
          <ng-content select="[mn-settings-section-action]" />
        </div>
      </header>
      <ng-content />
    </section>
  `,
})
export class SettingsSectionComponent {
  readonly heading = input.required<string>();
  readonly sectionId = input<string | null>(null);
  protected readonly headingId = `mn-settings-section-${String(nextSettingsSectionId++)}-heading`;
}
