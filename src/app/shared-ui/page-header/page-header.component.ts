import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../icon/icon.component';

/**
 * The header every page outside the reader wears.
 *
 * There is no application-wide navigation: a page states where it goes back to
 * and nothing else, so the only persistent chrome in Monosai is the reading
 * itself. Trailing controls are projected, which is how the Library carries its
 * link to Settings without a second header component.
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
            class="mn-icon-button"
            [attr.aria-label]="backLabel()"
            (click)="goBack(target)"
          >
            <mn-icon name="back" />
          </button>
        } @else {
          <a class="mn-icon-button" [routerLink]="target" [attr.aria-label]="backLabel()">
            <mn-icon name="back" />
          </a>
        }
      }
      <h1>{{ heading() }}</h1>
      <div class="trailing">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .head {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      min-width: 0;
    }

    h1 {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: 26px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .trailing {
      display: flex;
      flex: none;
      gap: var(--space-2);
      align-items: center;
    }

    @media (max-width: 600px) {
      .head {
        gap: var(--space-2);
      }

      h1 {
        font-size: 24px;
      }
    }
  `,
})
export class PageHeaderComponent {
  private readonly navigation = inject(NavigationHistoryService);
  readonly heading = input.required<string>();
  /** Omitted only by the Library, which is where every other page goes back to. */
  readonly backTo = input<string | null>(null);
  readonly backLabel = input('Back');
  protected readonly usesHistoryBack = computed(() => {
    const target = this.backTo();
    return target !== null && this.navigation.canPopTo(target);
  });

  protected goBack(fallback: string): void {
    void this.navigation.backOrNavigate(fallback);
  }
}
