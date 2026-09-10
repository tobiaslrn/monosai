import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../icon/icon.component';

/**
 * The header every page outside the reader wears.
 *
 * Each page states its own way back below the shell utility bar. Trailing
 * controls belong to this page; shared destinations live in the shell.
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
        @if (help()) {
          <a class="help-link" routerLink="/help" aria-label="Help" title="Help">
            <mn-icon name="help" [size]="24" />
          </a>
        }
      </div>
    </header>
    @if (subtitle(); as line) {
      <p class="subtitle" data-testid="page-subtitle">{{ line }}</p>
    }
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

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
      font-size: var(--text-2xl);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .trailing {
      display: flex;
      flex: none;
      gap: var(--space-2);
      align-items: center;
    }

    .trailing:empty {
      display: none;
    }

    /* Bare at rest, like the home header's own utilities. */
    .help-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid transparent;
      border-radius: var(--radius-control);
      color: var(--text-primary);
    }

    .help-link:hover {
      border-color: var(--border-subtle);
      background: var(--surface-sunken);
    }

    .subtitle {
      margin: var(--space-1) 0 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    @media (max-width: breakpoints.$narrow-max) {
      .head {
        gap: var(--space-2);
      }

      h1 {
        font-size: var(--text-2xl);
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
  /** One quiet line under the title: what the page holds, or how much of it. */
  readonly subtitle = input<string | null>(null);
  /**
   * Help at the end of the title row, for the pages that wear no utility bar
   * because they carry their own header, as the Library does.
   */
  readonly help = input(false);
  protected readonly usesHistoryBack = computed(() => {
    const target = this.backTo();
    return target !== null && this.navigation.canPopTo(target);
  });

  protected goBack(fallback: string): void {
    void this.navigation.backOrNavigate(fallback);
  }
}
