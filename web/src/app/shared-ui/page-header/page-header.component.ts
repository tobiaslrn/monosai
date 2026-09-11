import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../icon/icon.component';

/**
 * The top bar every page outside the reader wears.
 *
 * It is the page's only bar: Back where the page has a parent, otherwise the
 * Monosai mark, then the title, then whatever the page puts at its end. It
 * sticks to the top of the viewport, so the way back is always the first
 * thing on the screen.
 */
@Component({
  selector: 'mn-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <header class="head">
      @if (backTo(); as target) {
        @if (usesHistoryBack()) {
          <button
            type="button"
            class="mn-icon-button back"
            [attr.aria-label]="backLabel()"
            (click)="goBack(target)"
          >
            <mn-icon name="back" />
          </button>
        } @else {
          <a class="mn-icon-button back" [routerLink]="target" [attr.aria-label]="backLabel()">
            <mn-icon name="back" />
          </a>
        }
      } @else if (home()) {
        <img class="mark" src="icons/icon-192.png" alt="" width="32" height="32" />
      }
      <div class="titles">
        <h1 id="mn-page-title">{{ heading() }}</h1>
        @if (subtitle(); as line) {
          <p class="subtitle" data-testid="page-subtitle">{{ line }}</p>
        }
      </div>
      <div class="trailing">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    /*
     * No box of its own, so the bar's sticky containing block is the page
     * column rather than this element — otherwise it could never stick.
     */
    :host {
      display: contents;
    }

    .head {
      position: sticky;
      top: 0;
      z-index: 20;
      isolation: isolate;
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
      min-height: var(--touch-target);
      padding-block: var(--space-2);
      background: var(--surface-canvas);
    }

    /*
     * The column is measured but the bar's ground spans the viewport. Its lower
     * edge fades in once content has begun to pass beneath it, and is simply
     * always there where scroll-driven animation is not supported.
     */
    .head::before {
      position: absolute;
      z-index: -1;
      inset-block: 0;
      inset-inline: -100vw;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-canvas);
      content: '';
      pointer-events: none;
    }

    @supports (animation-timeline: scroll()) {
      .head::before {
        animation: mn-bar-edge linear both;
        animation-timeline: scroll(root);
        animation-range: 0 var(--space-4);
      }
    }

    /* Glyphs, not hit areas, line up with the column's edges. */
    .back {
      margin-inline-start: calc(-1 * var(--space-2));
    }

    .mark {
      flex: none;
      margin-inline-end: var(--space-1);
      border-radius: var(--radius-token);
    }

    .titles {
      flex: 1;
      min-width: 0;
    }

    h1 {
      margin: 0;
      overflow: hidden;
      font-size: var(--text-page-title);
      line-height: 1.25;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .subtitle {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .trailing {
      display: flex;
      flex: none;
      gap: var(--space-1);
      align-items: center;
      margin-inline-end: calc(-1 * var(--space-2));
    }

    .trailing:empty {
      display: none;
    }
  `,
})
export class PageHeaderComponent {
  private readonly navigation = inject(NavigationHistoryService);
  readonly heading = input.required<string>();
  /** Omitted only by the Library, which is where every other page goes back to. */
  readonly backTo = input<string | null>(null);
  readonly backLabel = input('Back');
  /** The home page leads with the Monosai mark where others lead with Back. */
  readonly home = input(false);
  /** One quiet line under the title: what the page holds, or how much of it. */
  readonly subtitle = input<string | null>(null);
  protected readonly usesHistoryBack = computed(() => {
    const target = this.backTo();
    return target !== null && this.navigation.canPopTo(target);
  });

  protected goBack(fallback: string): void {
    void this.navigation.backOrNavigate(fallback);
  }
}
