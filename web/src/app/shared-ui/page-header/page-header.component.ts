import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../icon/icon.component';
import { WordmarkComponent } from '../wordmark/wordmark.component';

/**
 * The top bar every page outside the reader wears.
 *
 * It is the page's only bar: Back where the page has a parent, the Monosai mark
 * on Home, then the title, then whatever the page puts at its end. It sticks to
 * the top of the viewport, so the way back is always the first thing on the
 * screen.
 */
@Component({
  selector: 'mn-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, WordmarkComponent],
  template: `
    <header class="head" [class.is-bare]="isBare()">
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
        @if (home()) {
          <h1 id="mn-page-title">
            <span class="mn-visually-hidden">{{ heading() }}</span>
            <mn-wordmark />
          </h1>
        } @else if (titleHidden()) {
          <h1 id="mn-page-title">
            <span class="mn-visually-hidden">{{ heading() }}</span>
          </h1>
        } @else {
          <h1 id="mn-page-title">{{ heading() }}</h1>
        }
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
    @use '../../../styles/breakpoints' as breakpoints;

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
      /* One height whatever the bar holds, so tabs do not move between pages. */
      min-height: calc(var(--touch-target) + 2 * var(--space-2));
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

    /*
     * Glyphs, not hit areas, line up with the column's edges. The title tucks
     * into Back's inset too, so the arrow and the title read as one unit.
     */
    .back {
      margin-inline: calc(-1 * var(--space-2));
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

    /*
     * A tab page's bar with no Back holds only its tabs, and below the wide
     * breakpoint those are docked to the bottom edge instead. What is left is
     * the hidden heading, which needs no room.
     */
    @media (max-width: breakpoints.$wide-max) {
      .head.is-bare {
        position: static;
        min-height: 0;
        padding-block: 0;
      }

      .head.is-bare::before {
        display: none;
      }
    }
  `,
})
export class PageHeaderComponent {
  private readonly navigation = inject(NavigationHistoryService);
  readonly heading = input.required<string>();
  /** Omitted by the tab pages, which are where every other page goes back to. */
  readonly backTo = input<string | null>(null);
  readonly backLabel = input('Back');
  /** Home leads with the Monosai mark and wordmark in place of its title. */
  readonly home = input(false);
  /**
   * A tab page shows no title, because the current tab names it. The heading
   * stays in the bar for assistive technology.
   */
  readonly titleHidden = input(false);
  /** One quiet line under the title: what the page holds, or how much of it. */
  readonly subtitle = input<string | null>(null);
  protected readonly isBare = computed(
    () => this.titleHidden() && this.backTo() === null && !this.home(),
  );
  protected readonly usesHistoryBack = computed(() => {
    const target = this.backTo();
    return target !== null && this.navigation.canPopTo(target);
  });

  protected goBack(fallback: string): void {
    void this.navigation.backOrNavigate(fallback);
  }
}
