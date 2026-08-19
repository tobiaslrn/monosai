import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import type { AnkiProviderKind } from '../../domain/vocabulary/snapshot';

const PROVIDER_LABELS: Record<AnkiProviderKind, string> = {
  'desktop-connect': 'Desktop Anki',
  'android-connect': 'Android bridge',
  package: 'Anki package',
};

/**
 * Every snapshot ever created, newest first.
 *
 * Snapshots are append-only and there is no way to delete one here: an older
 * snapshot may still be the frozen basis of a generated story, and the story
 * count is what makes that visible rather than leaving it as a surprise.
 */
@Component({
  selector: 'mn-snapshot-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="snapshots" data-testid="snapshot-history">
      @for (entry of history.entries(); track entry.snapshot.id) {
        <li class="snapshot" [class.is-active]="entry.isActive">
          <div class="head">
            <h3>{{ entry.snapshot.uniqueEntryCount }} unique expressions</h3>
            @if (entry.isActive) {
              <span class="badge">Active</span>
            }
          </div>

          <dl class="meta">
            <div>
              <dt>Created</dt>
              <dd>{{ formatted(entry.snapshot.createdAt) }}</dd>
            </div>
            <div>
              <dt>Read from</dt>
              <dd>{{ providerLabels(entry.providerKinds) }}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>
                @if (entry.sources.length === 0) {
                  <span class="mn-hint">None recorded</span>
                } @else {
                  {{ entry.sources.join('; ') }}
                }
              </dd>
            </div>
            <div>
              <dt>Stories using it</dt>
              <dd>{{ entry.storyCount }}</dd>
            </div>
          </dl>
        </li>
      } @empty {
        <li class="empty mn-hint">
          No vocabulary snapshots yet. Connect a source and refresh to create your first one.
        </li>
      }
    </ul>
  `,
  styles: `
    .snapshots {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-2);
    }

    .snapshot {
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
    }

    .snapshot.is-active {
      border-color: var(--action-primary);
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .head h3 {
      margin: 0;
      font-size: var(--text-md);
    }

    /* The soft pairing rather than solid: the design system's tinted background
       with its own foreground is what clears the contrast threshold at this
       size in both themes. */
    .badge {
      padding: 2px var(--space-1);
      border-radius: var(--radius-control);
      background: var(--status-success-soft);
      color: var(--status-success);
      font-size: var(--text-sm);
      font-weight: 600;
    }

    /* A definition list rather than a table, so it reflows at 320px. */
    .meta {
      display: grid;
      gap: var(--space-1);
      margin: 0;
    }

    @media (min-width: 720px) {
      .meta {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
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
      padding: var(--space-3);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-card);
    }
  `,
})
export class SnapshotHistoryComponent {
  protected readonly history = inject(SnapshotHistoryStore);

  protected providerLabels(kinds: readonly AnkiProviderKind[]): string {
    return kinds.length === 0
      ? 'Not recorded'
      : kinds.map((kind) => PROVIDER_LABELS[kind]).join(', ');
  }

  protected formatted(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
}
