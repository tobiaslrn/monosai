import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ICON_SET, type IconName } from './icon-set';

/**
 * Decorative icon. Every control using one also carries a visible label or an
 * accessible name, so the icon itself is hidden from assistive technology.
 */
@Component({
  selector: 'mn-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <lucide-icon
      [img]="icon()"
      [size]="size()"
      [strokeWidth]="1.8"
      aria-hidden="true"
      focusable="false"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);

  protected readonly icon = computed(() => ICON_SET[this.name()]);
}
