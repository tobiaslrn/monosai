import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

let nextSettingsSectionId = 0;

/**
 * The shared section frame for the settings-like pages.
 *
 * A heading sits on the canvas and the related content sits in one card. The
 * optional action slot keeps a section action beside its heading without
 * making every caller recreate the same accessible section structure.
 */
@Component({
  selector: 'mn-settings-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    @use '../../../styles/components/settings';
  `,
  template: `
    <section
      class="mn-settings-section group"
      [id]="sectionId()"
      [attr.aria-labelledby]="headingId"
    >
      <header class="mn-settings-section__header">
        <h2 [id]="headingId">{{ heading() }}</h2>
        <div class="mn-settings-section__action">
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
