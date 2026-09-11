import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';

interface Tab {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
}

const TABS: readonly Tab[] = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

/**
 * The three tab pages, as ordinary links.
 *
 * One component in two placements, of which only one is ever drawn: the shell
 * docks `bottom` to the viewport's lower edge below the wide breakpoint, and
 * each tab page puts `top` in its own bar from the wide breakpoint up. Each
 * sits in the document where it is drawn, so focus reaches it in visual order
 * ([ADR 0070](../../../../../docs/decisions/0070-home-library-and-settings-are-tabs.md)).
 */
@Component({
  selector: 'mn-main-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  host: { '[class]': "'is-' + placement()" },
  template: `
    <nav class="tabs" [class]="'is-' + placement()" aria-label="Main">
      @for (tab of tabs; track tab.path) {
        <a
          class="tab"
          [routerLink]="tab.path"
          routerLinkActive="is-current"
          ariaCurrentWhenActive="page"
        >
          <span class="glyph"><mn-icon [name]="tab.icon" [size]="20" /></span>
          <span class="label">{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    :host {
      display: contents;
    }

    @media (min-width: breakpoints.$wide) {
      :host(.is-bottom) {
        display: none;
      }
    }

    @media (max-width: breakpoints.$wide-max) {
      :host(.is-top) {
        display: none;
      }
    }

    .tab {
      color: var(--text-secondary);
      font-weight: var(--weight-semibold);
      text-decoration: none;
    }

    .glyph {
      display: grid;
      place-items: center;
      transition: background-color var(--motion-fast) ease-out;
    }

    /*
     * Docked to the viewport's lower edge. Opaque, so a row scrolling beneath
     * it never shows through, and padded by the safe-area inset so the labels
     * clear the system gesture bar.
     */
    .tabs.is-bottom {
      position: fixed;
      z-index: 30;
      inset-inline: 0;
      bottom: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      box-sizing: content-box;
      height: var(--tab-bar-height);
      padding: 0 var(--space-2) env(safe-area-inset-bottom);
      border-top: 1px solid var(--border-subtle);
      background: var(--surface-panel);
    }

    .is-bottom .tab {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      align-items: center;
      justify-content: center;
      min-width: 0;
      font-size: var(--text-xs);
      line-height: 1.3;
    }

    .is-bottom .glyph {
      width: 3.5rem;
      height: 2rem;
      border-radius: var(--radius-pill);
    }

    .is-bottom .tab.is-current {
      color: var(--text-primary);
    }

    .is-bottom .tab.is-current .glyph {
      background: var(--action-primary-soft);
      color: var(--action-primary-text);
    }

    /* At the end of the page's bar, where its controls go, before Home's Help. */
    .tabs.is-top {
      display: flex;
      gap: var(--space-1);
      align-items: center;
    }

    .is-top .tab {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-pill);
      font-size: var(--text-sm);
      transition: background-color var(--motion-fast) ease-out;
    }

    .is-top .tab.is-current {
      background: var(--action-primary-soft);
      color: var(--action-primary-text);
    }

    :host-context(html[data-pointer='mouse']) .is-top .tab:not(.is-current):hover,
    :host-context(html[data-pointer='mouse']) .is-bottom .tab:not(.is-current):hover .glyph {
      background: var(--surface-sunken);
    }

    @media (prefers-reduced-motion: reduce) {
      .glyph,
      .is-top .tab {
        transition: none;
      }
    }
  `,
})
export class MainNavComponent {
  readonly placement = input.required<'top' | 'bottom'>();
  protected readonly tabs = TABS;
}
