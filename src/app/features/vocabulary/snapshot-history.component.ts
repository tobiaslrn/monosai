import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
/** Shows the one current vocabulary result and its source summary. */
@Component({
  selector: 'mn-snapshot-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (history.activeEntry(); as entry) {
      <article class="snapshot" data-testid="current-snapshot">
        <div class="head">
          <strong class="count">{{ entry.snapshot.uniqueEntryCount }}</strong>
          <span class="count-label">unique expressions</span>
        </div>

        <dl class="meta">
          <div>
            <dt>From</dt>
            <dd>
              {{ entry.sources.length }} {{ entry.sources.length === 1 ? 'source' : 'sources' }}
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{{ formatted(entry.snapshot.createdAt) }}</dd>
          </div>
          <div>
            <dt>Used by</dt>
            <dd>{{ entry.storyCount }} {{ entry.storyCount === 1 ? 'story' : 'stories' }}</dd>
          </div>
        </dl>
      </article>
    } @else {
      <p class="empty mn-hint" data-testid="current-snapshot">No words yet.</p>
    }
  `,
  styles: `
    .snapshot {
      display: flex;
      align-items: end;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-3);
      padding: var(--space-4);
      background: var(--surface-raised);
      border-radius: var(--radius-card);
    }

    .head {
      display: flex;
      align-items: baseline;
      gap: var(--space-1);
    }

    .count {
      font-size: clamp(2rem, 5vw, 3rem);
      line-height: 1;
    }

    .count-label {
      color: var(--text-secondary);
    }

    /* A definition list rather than a table, so it reflows at 320px. */
    .meta {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: var(--space-4);
      margin: 0;
    }

    @media (max-width: 560px) {
      .meta {
        grid-template-columns: 1fr 1fr;
        width: 100%;
      }
    }

    .meta dt {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .meta dd {
      margin: 0;
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }

    .empty {
      margin: 0;
      padding: var(--space-4);
      background: var(--surface-raised);
      border-radius: var(--radius-card);
    }
  `,
})
export class SnapshotHistoryComponent {
  protected readonly history = inject(SnapshotHistoryStore);

  protected formatted(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
}
