import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { ManualSourceSyncStore } from '../../application/vocabulary/manual-source-sync.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SourceStandingStore } from '../../application/vocabulary/source-standing.store';
import {
  LOGGER,
  NOOP_LOGGER,
  reportRejection,
  type Logger,
} from '../../application/shared/diagnostics';
import { CLOCK } from '../../application/shared/repository-tokens';
import { formatCountOf, formatDate, formatRelativeDay } from '../../domain/shared/locale';
import type { VocabularySource } from '../../domain/vocabulary/vocabulary-source';
import {
  isAutomaticAnkiSource,
  isIncludedInVocabulary,
} from '../../domain/vocabulary/vocabulary-source';
import { ButtonDirective } from '../../shared-ui/button/button';
import { RowComponent } from '../../shared-ui/row/row.component';
import { ClusterComponent } from '../../shared-ui/layout/layout';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';

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
  imports: [IconComponent, ListRowComponent, ButtonDirective, RowComponent, ClusterComponent],
  template: `
    <ul class="mn-list-group">
      @for (source of sources(); track source.id) {
        <li>
          <mn-list-row
            variant="flush"
            [class.is-off]="!included(source)"
            [mutedLeading]="!included(source)"
            [routerLink]="['/reading-level/source', source.id]"
            [testId]="'source-row'"
          >
            <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
              <mn-icon [name]="iconFor(source)" [size]="18" />
            </span>
            <span mn-list-row-title>{{ source.label }}</span>
            <span mn-list-row-meta>
              <mn-cluster [gap]="1">
                @if (needsAttention(source)) {
                  <mn-icon name="warning" tone="warning" [size]="14" />
                }
                <span>{{ whereLine(source) }}</span>
              </mn-cluster>
            </span>
            <mn-icon mn-list-row-trailing name="chevron-right" />
          </mn-list-row>
        </li>
      } @empty {
        <li>
          <mn-row testId="no-sources">
            <span mn-row-meta>No sources yet. Add one to use your words.</span>
          </mn-row>
        </li>
      }
      @if (attention(); as message) {
        <li>
          <mn-row testId="source-attention">
            <mn-icon mn-row-leading name="warning" tone="warning" />
            <span mn-row-meta>{{ message }}</span>
            <button
              mnButton="ghost"
              type="button"
              [attr.aria-busy]="syncing() ? 'true' : null"
              (click)="syncAgain()"
              data-testid="attention-retry"
            >
              Try now
            </button>
          </mn-row>
        </li>
      } @else if (syncedLabel(); as synced) {
        <li>
          <mn-row testId="source-synced">
            <mn-icon mn-row-leading name="synced" tone="success" [size]="22" />
            <span mn-row-meta>{{ synced }}</span>
            @if (canSyncAgain()) {
              <button
                mnButton="icon"
                type="button"
                [attr.aria-busy]="syncing() ? 'true' : null"
                aria-label="Read Anki again"
                title="Read Anki again"
                (click)="syncAgain()"
                data-testid="sync-again"
              >
                <mn-icon name="sync" tone="accent" [size]="20" [spin]="syncing()" />
              </button>
            }
          </mn-row>
        </li>
      }
    </ul>
  `,
})
export class SourceListComponent {
  private readonly store = inject(SourceMappingStore);
  private readonly standings = inject(SourceStandingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });
  private readonly clock = inject(CLOCK);
  private readonly manual = inject(ManualSourceSyncStore);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  protected readonly sources = this.store.sources;

  constructor() {
    // Each row's number is its source's last complete read. The active
    // snapshot is part of the key as well, because re-reading one source
    // changes its cache without changing the list the rows come from. The
    // loader runs untracked, so nothing it reads can bring it back. An automatic
    // read that found the same words moves the revision alone, and its rows
    // still have a new number and date.
    resource({
      params: () => ({
        ids: this.sources().map((source) => source.id),
        snapshot: this.history.active(),
        revision: this.automatic?.committedRevision() ?? null,
      }),
      loader: ({ params }) =>
        this.standings.load(params.ids).catch((error: unknown) => {
          reportRejection(this.logger, error);
        }),
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
    if (this.syncing()) {
      return;
    }
    this.manual.dismiss();
    void this.automatic?.trigger(true, true).then(() => this.history.load());
  }
}
