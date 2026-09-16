import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

let nextSettingsSectionId = 0;

/**
 * The shared section frame for the settings-like pages.
 *
 * A heading sits on the canvas and the related content sits in one card. The
 * optional action slot keeps a section action beside its heading without
 * making every caller recreate the same accessible section structure.
 *
 * The optional leading icon is decoration on the heading, never the only thing
 * that says what a section is. The AI section uses it to carry the mark for
 * spending an OpenRouter key; see the design system for where that mark may
 * appear.
 */
@Component({
  selector: 'mn-settings-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
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
        <h2 [id]="headingId">
          @if (icon(); as name) {
            <mn-icon [name]="name" [size]="18" aria-hidden="true" />
          }
          {{ heading() }}
        </h2>
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
  readonly icon = input<IconName | null>(null);
  protected readonly headingId = `mn-settings-section-${String(nextSettingsSectionId++)}-heading`;
}
