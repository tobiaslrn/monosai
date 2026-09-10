import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { SourceStandingStore } from '../../application/vocabulary/source-standing.store';
import { formatCountOf } from '../../domain/shared/locale';
import { isIncludedInVocabulary } from '../../domain/vocabulary/vocabulary-source';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { vocabularyCountLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * How many words Monosai can write from, and the way into all of them.
 *
 * The page's first fact, and one link, because the only thing to do with the
 * count is look at what it counts. Where the words come from is the list of
 * sources below it, so the card does not say it a second time.
 */
@Component({
  selector: 'mn-vocabulary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <a class="mn-card card" routerLink="/reading-level/vocabulary" data-testid="browse-vocabulary">
      <span class="mn-icon-badge" aria-hidden="true"
        ><mn-icon name="vocabulary" [size]="24"
      /></span>
      <span class="copy" data-testid="source-standing">
        <span class="title">Vocabulary</span>
        <span class="count" data-testid="words-standing">{{ wordsValue() }}</span>
        @if (detail(); as line) {
          <span class="detail">{{ line }}</span>
        }
      </span>
      <mn-icon class="chevron" name="chevron-right" />
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: 4.5rem;
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-3);
      color: inherit;
      text-decoration: none;
      transition: background-color var(--motion-fast) ease-out;
    }

    .card:hover {
      background: var(--surface-sunken);
    }

    .mn-icon-badge {
      width: 3.25rem;
      height: 3.25rem;
    }

    .copy {
      display: grid;
      flex: 1;
      gap: 0.1rem;
      min-width: 0;
    }

    .title {
      font-size: var(--text-xl);
      font-weight: var(--weight-bold);
      letter-spacing: -0.01em;
    }

    .count {
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .detail {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .chevron {
      flex: none;
      color: var(--text-secondary);
    }
  `,
})
export class VocabularyCardComponent {
  private readonly mappings = inject(SourceMappingStore);
  private readonly standings = inject(SourceStandingStore);
  private readonly history = inject(SnapshotHistoryStore);

  protected readonly wordsValue = computed(() => {
    if (this.history.lastFailure() !== null) {
      return 'Words unavailable';
    }
    const snapshot = this.history.active();
    const sources = this.mappings.sources();
    // Removing the last source leaves an empty snapshot behind, which is the
    // same standing as a fresh install and says so. A snapshot that still has
    // words keeps its count whatever the list shows: a number that exists is
    // never hidden.
    if (snapshot === null || (snapshot.uniqueEntryCount === 0 && sources.length === 0)) {
      return 'No words yet';
    }
    if (sources.some((source) => !isIncludedInVocabulary(source))) {
      const sourceTotal = sources.reduce(
        (total, source) => total + (this.standings.standingFor(source.id)?.entryCount ?? 0),
        0,
      );
      return `${formatCountOf(snapshot.uniqueEntryCount, 'counted word')} · ${formatCountOf(sourceTotal, 'word')} in ${formatCountOf(sources.length, 'source')}`;
    }
    return vocabularyCountLabel(snapshot.uniqueEntryCount);
  });

  /** Said only when the count alone would mislead. */
  protected readonly detail = computed(() => {
    if (this.history.lastFailure() !== null) {
      return 'Your saved words could not be read.';
    }
    if (this.history.active() === null && this.mappings.sources().length > 0) {
      return 'Nothing has been read yet';
    }
    return null;
  });
}
