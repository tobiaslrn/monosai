import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { ManualSourceSyncStore } from '../../application/vocabulary/manual-source-sync.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SourceStandingStore } from '../../application/vocabulary/source-standing.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { formatCountOf, formatDate, formatRelativeDay } from '../../domain/shared/locale';
import type { VocabularySource } from '../../domain/vocabulary/vocabulary-source';
import {
  isAutomaticAnkiSource,
  isIncludedInVocabulary,
} from '../../domain/vocabulary/vocabulary-source';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';

/** One icon per kind of source, the same one the Add words sheet shows for it. */
const SOURCE_ICONS: Readonly<Record<VocabularySource['kind'], IconName>> = {
  'anki-connect': 'anki-source',
  'anki-package': 'file',
  'text-list': 'word-list',
};

/**
 * One card: a row per source, then how current they are.
 *
 * A row answers what it is, where it came from, and how many words — nothing
 * else, because everything a source can be configured to do lives on its own
 * page and the row is the way in. The last line of the card is the one thing
 * the list as a whole can report: when it was last read, with the control that
 * reads it again, or what is stopping it.
 */
@Component({
  selector: 'mn-source-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="mn-card">
      <ul class="sources">
        @for (source of sources(); track source.id) {
          <li>
            <a
              class="row"
              [class.is-off]="!included(source)"
              [routerLink]="['/reading-level/source', source.id]"
              data-testid="source-row"
            >
              <span class="mn-icon-badge" aria-hidden="true">
                <mn-icon [name]="iconFor(source)" [size]="22" />
              </span>
              <span class="rmain">
                <span class="rname">{{ source.label }}</span>
                <span class="rwhere">
                  @if (needsAttention(source)) {
                    <span class="warn-dot" aria-hidden="true"></span>
                  }
                  {{ whereLine(source) }}
                </span>
              </span>
              <mn-icon class="chevron" name="chevron-right" />
            </a>
          </li>
        } @empty {
          <li class="empty mn-hint" data-testid="no-sources">
            No sources yet. Add one to use your words.
          </li>
        }
      </ul>

      @if (attention(); as message) {
        <p class="status is-attention" data-testid="source-attention">
          <mn-icon name="warning" [size]="20" />
          <span class="status-text">{{ message }}</span>
          <button
            type="button"
            class="mn-button"
            [disabled]="syncing()"
            (click)="syncAgain()"
            data-testid="attention-retry"
          >
            Try now
          </button>
        </p>
      } @else if (syncedLabel(); as synced) {
        <p class="status" data-testid="source-synced">
          <mn-icon class="synced" name="synced" [size]="22" />
          <span class="status-text">{{ synced }}</span>
          @if (canSyncAgain()) {
            <button
              type="button"
              class="sync"
              [class.is-busy]="syncing()"
              [disabled]="syncing()"
              aria-label="Read Anki again"
              title="Read Anki again"
              (click)="syncAgain()"
              data-testid="sync-again"
            >
              <mn-icon name="sync" [size]="20" />
            </button>
          }
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .sources {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .sources li + li {
      border-top: 1px solid var(--border-subtle);
    }

    .row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      width: 100%;
      min-height: 4rem;
      padding: var(--space-3);
      border-radius: var(--radius-card);
      color: inherit;
      text-decoration: none;
      transition: background-color var(--motion-fast) ease-out;
    }

    .row:hover {
      background: var(--surface-sunken);
    }

    .rmain {
      display: grid;
      flex: 1;
      gap: 1px;
      min-width: 0;
    }

    .rname {
      overflow: hidden;
      font-size: var(--text-lg);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rwhere {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }

    /*
     * Left out of the vocabulary, not broken: the row keeps its full contrast
     * for the name and dims only its mark.
     */
    .row.is-off .mn-icon-badge {
      opacity: 0.55;
    }

    .chevron {
      flex: none;
      color: var(--text-secondary);
    }

    .warn-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-right: 0.35em;
      border-radius: 50%;
      background: var(--status-warning);
      vertical-align: 0.05em;
    }

    .status {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: 3.5rem;
      margin: 0 var(--space-3);
      padding: var(--space-2) 0;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }

    .status-text {
      flex: 1;
      min-width: 0;
    }

    .synced {
      flex: none;
      color: var(--status-success);
    }

    .status.is-attention {
      color: var(--status-warning);
      font-size: var(--text-sm);
    }

    .status.is-attention mn-icon {
      flex: none;
    }

    .status.is-attention .mn-button {
      flex: none;
      border-color: currentcolor;
      border-radius: var(--radius-pill);
      color: inherit;
    }

    .sync {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-primary);
      cursor: pointer;
    }

    .sync:hover:not(:disabled) {
      background: var(--surface-sunken);
    }

    .sync:disabled {
      color: var(--text-secondary);
      cursor: default;
    }

    .sync.is-busy mn-icon {
      animation: mn-sync-turn 1s linear infinite;
    }

    @keyframes mn-sync-turn {
      to {
        transform: rotate(1turn);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sync.is-busy mn-icon {
        animation: none;
      }
    }

    .empty {
      padding: var(--space-4);
    }
  `,
})
export class SourceListComponent {
  private readonly store = inject(SourceMappingStore);
  private readonly standings = inject(SourceStandingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });
  private readonly clock = inject(CLOCK);
  private readonly manual = inject(ManualSourceSyncStore);

  protected readonly sources = this.store.sources;

  constructor() {
    // Each row's number is its source's last complete read. The active
    // snapshot is read here as well, because re-reading one source changes its
    // cache without changing the list the rows come from.
    effect(() => {
      const ids = this.sources().map((source) => source.id);
      this.history.active();
      void this.standings.load(ids);
    });
  }

  /** `Synced today`, once anything has been read at all. */
  protected readonly syncedLabel = computed(() => {
    const read = this.standings.lastReadAt();
    if (read === null || this.sources().length === 0) {
      return null;
    }
    return `Synced ${formatRelativeDay(read, this.clock.now())}`;
  });

  /**
   * Only a source Monosai keeps up to date by itself can be read again from
   * here. A file never changes, and a source read by hand is read on its page.
   */
  protected readonly canSyncAgain = computed(
    () => this.automatic !== null && this.sources().some(isAutomaticAnkiSource),
  );

  protected readonly syncing = computed(
    () => this.automatic?.status().kind === 'checking' || this.manual.isSyncing(),
  );

  /**
   * One line for a source that is not answering.
   *
   * A source that is merely out of date is not an error — it still counts, from
   * its last read — so the line says which source and when it was last read
   * rather than reporting a failure.
   */
  protected readonly attention = computed(() => {
    const failed = this.sources().find((source) => this.manual.failureFor(source.id) !== null);
    if (failed !== undefined) {
      return `${failed.label} could not be read. Its words are still here, from its last read.`;
    }
    const status = this.automatic?.status();
    if (status?.kind === 'waiting' || status?.kind === 'attention') {
      return status.message;
    }
    // Whatever the last build of the vocabulary had to say about its inputs.
    // One line, because two warnings about the same list are one problem.
    return this.history.active()?.stats.sourceWarnings[0] ?? null;
  });

  protected included(source: VocabularySource): boolean {
    return isIncludedInVocabulary(source);
  }

  protected iconFor(source: VocabularySource): IconName {
    return SOURCE_ICONS[source.kind];
  }

  protected needsAttention(source: VocabularySource): boolean {
    if (this.manual.failureFor(source.id) !== null) {
      return true;
    }
    const status = this.automatic?.status();
    const unsettled = status?.kind === 'waiting' || status?.kind === 'attention';
    return unsettled && isAutomaticAnkiSource(source);
  }

  protected whereLine(source: VocabularySource): string {
    const standing = this.standings.standingFor(source.id);
    const count = standing === null ? '' : ` · ${formatCountOf(standing.entryCount, 'word')}`;
    const suffix = this.included(source) ? '' : ' · not counted';
    return `${this.origin(source)}${count}${suffix}`;
  }

  private origin(source: VocabularySource): string {
    switch (source.kind) {
      case 'anki-connect': {
        const where =
          source.providerKind === 'android-connect' ? 'On this device' : 'On this computer';
        return this.standings.standingFor(source.id) === null ? `${where} · not read yet` : where;
      }
      case 'anki-package':
        return `File · imported ${formatDate(source.createdAt)}`;
      case 'text-list':
        return `Your list · edited ${formatRelativeDay(source.updatedAt, this.clock.now())}`;
    }
  }

  protected syncAgain(): void {
    this.manual.dismiss();
    void this.automatic?.trigger(true);
  }
}
