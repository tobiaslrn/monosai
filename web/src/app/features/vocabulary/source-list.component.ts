import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { ManualSourceSyncStore } from '../../application/vocabulary/manual-source-sync.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SourceStandingStore } from '../../application/vocabulary/source-standing.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { formatCount, formatDate, formatRelativeDay } from '../../domain/shared/locale';
import type { VocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { isIncludedInVocabulary } from '../../domain/vocabulary/vocabulary-source';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import {
  vocabularyCountLabel,
  vocabularySourceSummary,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * One line of standing, then one row per source.
 *
 * A row answers what it is, where it came from, and how many words — nothing
 * else, because everything a source can be configured to do lives on its own
 * page and the row is the way in. The dot on a row and the line under the list
 * are the same fact said twice: once where you scan, once where you can act on
 * it.
 */
@Component({
  selector: 'mn-source-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <p class="standing" data-testid="source-standing">
      <b data-testid="words-standing">{{ wordsValue() }}</b>
      @if (standingDetail(); as detail) {
        <span>{{ detail }}</span>
      }
    </p>

    <ul class="sources">
      @for (source of sources(); track source.id) {
        <li>
          <a
            class="row"
            [class.is-off]="!included(source)"
            [routerLink]="['/reading-level/source', source.id]"
            data-testid="source-row"
          >
            <span class="rmain">
              <span class="rname">{{ source.label }}</span>
              <span class="rwhere">
                @if (needsAttention(source)) {
                  <span class="warn-dot" aria-hidden="true"></span>
                }
                {{ whereLine(source) }}
              </span>
            </span>
            <span class="rnum">{{ countLabel(source) }}</span>
            <mn-icon name="chevron-right" />
          </a>
        </li>
      } @empty {
        <li class="empty mn-hint" data-testid="no-sources">
          No sources yet. Add words and Monosai reads them from wherever you keep them.
        </li>
      }
    </ul>

    @if (attention(); as message) {
      <p class="flag" data-testid="source-attention">
        <span>{{ message }}</span>
        <button
          type="button"
          class="mn-button"
          [disabled]="manual.isSyncing()"
          (click)="tryNow()"
          data-testid="attention-retry"
        >
          Try now
        </button>
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    /*
     * The count and its detail are two type sizes on one line, so they are
     * aligned on the baseline they share. Flex's default stretch centred each
     * item in its own box instead, and the smaller half rode high.
     */
    .standing {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--space-2);
      align-items: baseline;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .standing b {
      color: var(--text-primary);
      font-size: var(--text-md);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: var(--space-3);
      align-items: center;
      width: 100%;
      min-height: 56px;
      padding: var(--space-2) 0;
      color: inherit;
      text-decoration: none;
    }

    .row:hover .rname {
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .rmain {
      display: grid;
      gap: 1px;
      min-width: 0;
    }

    .rname {
      overflow: hidden;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rwhere {
      overflow: hidden;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rnum {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }

    /*
     * Left out of the vocabulary, not broken: the row keeps its full contrast
     * for the name and dims only what is no longer counted.
     */
    .row.is-off .rnum {
      opacity: 0.6;
    }

    mn-icon {
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

    .flag {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-3);
      align-items: center;
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      background: var(--status-warning-soft);
      color: var(--status-warning);
      font-size: var(--text-sm);
    }

    .flag .mn-button {
      min-height: 34px;
      padding: 0 var(--space-3);
      border-color: currentcolor;
      color: inherit;
    }

    .empty {
      padding: var(--space-4) 0;
    }
  `,
})
export class SourceListComponent {
  private readonly store = inject(SourceMappingStore);
  private readonly standings = inject(SourceStandingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });
  private readonly clock = inject(CLOCK);
  protected readonly manual = inject(ManualSourceSyncStore);

  protected readonly sources = this.store.sources;

  constructor() {
    // Each row's number and date are its source's last complete read. The
    // active snapshot is read here as well, because re-reading one source
    // changes its cache without changing the list the rows come from.
    effect(() => {
      const ids = this.sources().map((source) => source.id);
      this.history.active();
      void this.standings.load(ids);
    });
  }

  protected readonly wordsValue = computed(() => {
    if (this.history.lastFailure() !== null) {
      return 'Words unavailable';
    }
    const snapshot = this.history.active();
    // Removing the last source leaves an empty snapshot behind, which is the
    // same standing as a fresh install and says so. Counting it as "0 words"
    // contradicted the row underneath saying there were no sources at all.
    // A snapshot that still has words keeps its count whatever the list shows:
    // a number that exists is never hidden.
    if (snapshot === null || (snapshot.uniqueEntryCount === 0 && this.sources().length === 0)) {
      return 'No words yet';
    }
    return vocabularyCountLabel(snapshot.uniqueEntryCount);
  });

  /** `from Anki + Pasted list · checked today`, or what to do when there is nothing. */
  protected readonly standingDetail = computed(() => {
    if (this.history.lastFailure() !== null) {
      return '· your saved words could not be read. Nothing was changed.';
    }
    const snapshot = this.history.active();
    if (snapshot === null) {
      return this.sources().length === 0 ? null : '· nothing has been read yet';
    }
    // Nothing left to be provenance for: the count above already said so.
    if (snapshot.uniqueEntryCount === 0 && this.sources().length === 0) {
      return null;
    }
    const checked = this.standings.lastReadAt();
    const from = `· from ${vocabularySourceSummary(snapshot.sourceKinds)}`;
    return checked === null
      ? from
      : `${from} · checked ${formatRelativeDay(checked, this.clock.now())}`;
  });

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

  protected needsAttention(source: VocabularySource): boolean {
    if (this.manual.failureFor(source.id) !== null) {
      return true;
    }
    const status = this.automatic?.status();
    const unsettled = status?.kind === 'waiting' || status?.kind === 'attention';
    return unsettled && source.kind === 'anki-connect' && source.automaticSync;
  }

  protected countLabel(source: VocabularySource): string {
    const standing = this.standings.standingFor(source.id);
    return standing === null ? '—' : formatCount(standing.entryCount);
  }

  protected whereLine(source: VocabularySource): string {
    const suffix = this.included(source) ? '' : ' · not counted';
    return `${this.origin(source)}${suffix}`;
  }

  private origin(source: VocabularySource): string {
    const now = this.clock.now();
    switch (source.kind) {
      case 'anki-connect': {
        const where = source.providerKind === 'android-connect' ? 'Anki on this device' : 'Anki';
        const read = this.standings.standingFor(source.id);
        return read === null
          ? `${where} · not read yet`
          : `${where} · read ${formatRelativeDay(read.readAt, now)}`;
      }
      case 'anki-package':
        return `File · imported ${formatDate(source.createdAt)}`;
      case 'text-list':
        return `Your list · edited ${formatRelativeDay(source.updatedAt, now)}`;
    }
  }

  protected tryNow(): void {
    this.manual.dismiss();
    void this.automatic?.trigger(true);
  }
}
