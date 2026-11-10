import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What sits at the end of a list that loads in pages: a quiet line while the
 * next page is on its way, and whatever is projected, such as the notice that
 * says why it did not arrive.
 *
 *   <mn-paging-status [loading]="store.loadingMore()" loadingLabel="Loading more stories…">
 *     <mn-notice tone="error" role="alert">…</mn-notice>
 *   </mn-paging-status>
 *
 * The line pulses rather than spinning: it says work is happening without
 * promising how far along it is.
 */
@Component({
  selector: 'mn-paging-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="loading" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        {{ loadingLabel() }}
      </p>
    }
    <ng-content />
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-block: var(--space-2);
    }

    .loading {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: center;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      @include motion.pulse;
    }
  `,
})
export class PagingStatusComponent {
  readonly loading = input(false);
  readonly loadingLabel = input('Loading more…');
}
