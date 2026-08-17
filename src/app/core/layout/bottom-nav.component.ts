import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { NavigationItem } from './navigation-items';

@Component({
  selector: 'mn-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="bar" aria-label="Primary">
      <ul>
        @for (item of items(); track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              #link="routerLinkActive"
              [attr.aria-current]="link.isActive ? 'page' : null"
            >
              <mn-icon [name]="item.icon" [size]="22" />
              <span>{{ item.label }}</span>
            </a>
          </li>
        }
        @if (hasMore()) {
          <li>
            <button type="button" (click)="moreOpened.emit()">
              <mn-icon name="more" [size]="22" />
              <span>More</span>
            </button>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './bottom-nav.component.scss',
})
export class BottomNavComponent {
  readonly items = input.required<readonly NavigationItem[]>();
  readonly hasMore = input(false);
  readonly moreOpened = output<void>();
}
