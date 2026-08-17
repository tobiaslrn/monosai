import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { NavigationItem } from './navigation-items';

@Component({
  selector: 'mn-sidebar-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="sidebar" aria-label="Primary">
      <p class="wordmark" [class.wordmark--compact]="compact()">
        <span aria-hidden="true">物</span>
        <span [class.mn-visually-hidden]="compact()">Monosai</span>
      </p>
      <ul>
        @for (item of items(); track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              [attr.title]="compact() ? item.label : null"
              #link="routerLinkActive"
              [attr.aria-current]="link.isActive ? 'page' : null"
            >
              <mn-icon [name]="item.icon" />
              <span [class.mn-visually-hidden]="compact()">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './sidebar-nav.component.scss',
})
export class SidebarNavComponent {
  readonly items = input.required<readonly NavigationItem[]>();
  readonly compact = input(false);
}
