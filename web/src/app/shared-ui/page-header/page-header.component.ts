import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../icon/icon.component';
import { WordmarkComponent } from '../wordmark/wordmark.component';
import { PageNoticeSlot } from './page-notice-slot';

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
  imports: [NgTemplateOutlet, RouterLink, IconComponent, WordmarkComponent],
  template: `
    <header #bar class="head" [class.head--home]="home()">
      @if (backTo(); as target) {
        @if (stepsBack()) {
          <button
            type="button"
            class="mn-icon-button back"
            data-testid="step-back"
            [attr.aria-label]="backLabel()"
            [attr.title]="backLabel()"
            (click)="backPressed.emit()"
          >
            <mn-icon name="back" />
          </button>
        } @else if (usesHistoryBack()) {
          <button
            type="button"
            class="mn-icon-button back"
            [attr.aria-label]="backLabel()"
            [attr.title]="backLabel()"
            (click)="goBack(target)"
          >
            <mn-icon name="back" />
          </button>
        } @else {
          <a
            class="mn-icon-button back"
            [routerLink]="target"
            [attr.aria-label]="backLabel()"
            [attr.title]="backLabel()"
          >
            <mn-icon name="back" />
          </a>
        }
      } @else if (home()) {
        <span class="mark-wrap">
          <img class="mark" src="icons/icon-192.png" alt="" width="32" height="30" />
          @if (showAlpha()) {
            <span class="alpha-marker" aria-label="Alpha version">α</span>
          }
        </span>
      }
      <div class="titles" [class.titles--home]="home()">
        @if (home()) {
          <h1 id="mn-page-title">
            <span class="mn-visually-hidden">{{ heading() }}</span>
            <mn-wordmark />
          </h1>
        } @else {
          <h1 id="mn-page-title">{{ heading() }}</h1>
        }
        @if (subtitle(); as line) {
          <p class="subtitle" data-testid="page-subtitle">{{ line }}</p>
        }
      </div>
      <div class="trailing mn-trailing">
        <ng-content />
      </div>
    </header>
    @if (noticeSlot?.template(); as notice) {
      <ng-container [ngTemplateOutlet]="notice" />
    }
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
      flex-wrap: wrap;
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

    /*
     * Glyphs, not hit areas, line up with the column's edges. The title tucks
     * into Back's inset too, so the arrow and the title read as one unit.
     */
    .back {
      margin-inline: calc(-1 * var(--space-2));
    }

    /*
     * Where the window leaves canvas beside the column, Back hangs in it, so
     * the title starts on the column's edge with the headings and cards below.
     */
    @media (min-width: breakpoints.$wide) {
      .back {
        margin-inline-start: calc(-1 * var(--touch-target));
      }
    }

    .mark {
      flex: none;
      inline-size: var(--space-6);
      block-size: calc(var(--space-6) - calc(0.5 * var(--space-1)));
      border-radius: var(--radius-token);
      object-fit: cover;
      object-position: center top;
    }

    .mark-wrap {
      position: relative;
      flex: none;
      margin-inline-end: var(--space-1);
    }

    .alpha-marker {
      position: absolute;
      top: calc(-2.5 * var(--space-1));
      right: calc(-0.5 * var(--space-2));
      padding-inline: 1px;
      border-radius: var(--radius-control);
      background: var(--surface-canvas);
      color: var(--status-danger);
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
      white-space: nowrap;
    }

    /* The title keeps room to read; at large text the trailing action drops to its own line. */
    .titles {
      flex: 1;
      min-width: min(min-content, 100%);
    }

    /* The home bar leads with a wordmark, not a title that needs room to read. */
    .head--home {
      flex-wrap: nowrap;
    }

    .titles--home {
      min-width: 0;
    }

    /* A long heading wraps, so large text never cuts it off. */
    h1 {
      margin: 0;
      font-size: var(--text-page-title);
      line-height: var(--leading-tight);
      overflow-wrap: break-word;
    }

    .titles--home h1 {
      overflow: hidden;
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
      margin-inline: auto calc(-1 * var(--space-2));
    }

    .trailing:empty {
      display: none;
    }
  `,
})
export class PageHeaderComponent {
  private readonly navigation = inject(NavigationHistoryService);
  /** The frame's notice for whichever page is showing, drawn as the page's first block. */
  protected readonly noticeSlot = inject(PageNoticeSlot, { optional: true });
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  readonly heading = input.required<string>();
  /** Omitted only by the Library, which is where every other page goes back to. */
  readonly backTo = input<string | null>(null);
  readonly backLabel = input('Back');
  /** The home page leads with the Monosai mark where others lead with Back. */
  readonly home = input(false);
  /** Shows the current release stage over the home mark when requested. */
  readonly showAlpha = input(false);
  /** One quiet line under the title: what the page holds, or how much of it. */
  readonly subtitle = input<string | null>(null);
  /**
   * Back goes up one step inside the page rather than to `backTo`, as on a
   * form with steps. The page decides what that step is from `backPressed`.
   */
  readonly stepsBack = input(false);
  readonly backPressed = output<void>();
  protected readonly usesHistoryBack = computed(() => {
    const target = this.backTo();
    return target !== null && this.navigation.canPopTo(target);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const root = document.documentElement;
      const bar = this.bar().nativeElement;
      // At large text the bar is tall enough to hide a focused control behind
      // it, so scrolling to focus keeps clear of it. At normal size nothing changes.
      const keepFocusBelow = (): void => {
        const large = parseFloat(getComputedStyle(root).fontSize) > 16;
        if (large) {
          root.style.scrollPaddingTop = `${String(bar.offsetHeight)}px`;
        } else {
          root.style.removeProperty('scroll-padding-top');
        }
      };
      const observer = new ResizeObserver(keepFocusBelow);
      observer.observe(bar);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        root.style.removeProperty('scroll-padding-top');
      });
    });
  }

  protected goBack(fallback: string): void {
    void this.navigation.backOrNavigate(fallback);
  }
}
