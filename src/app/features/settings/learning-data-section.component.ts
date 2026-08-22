import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import type { AnkiProviderKind, VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';

const PROVIDER_LABELS: Record<AnkiProviderKind, string> = {
  'desktop-connect': 'AnkiConnect',
  'android-connect': 'AnkiConnect',
  package: 'Anki package',
};

type VocabularyStatusSnapshot = Pick<VocabularySnapshot, 'uniqueEntryCount' | 'providerKinds'>;

/** Keeps the setup summary truthful for both live connections and package imports. */
export function formatVocabularyState(snapshot: VocabularyStatusSnapshot | null): string {
  if (snapshot === null) {
    return 'No vocabulary snapshot yet';
  }

  const sources = [...new Set(snapshot.providerKinds.map((kind) => PROVIDER_LABELS[kind]))];
  const source = sources.length > 0 ? sources.join(' + ') : 'Source not recorded';
  return `${snapshot.uniqueEntryCount.toLocaleString('en')} unique expressions · ${source}`;
}

/**
 * The two screens that describe the learner rather than the application.
 *
 * They are large enough to own routes but are not destinations anyone navigates
 * to twice a session, so Settings holds them as two rows that say their current
 * state in one line each.
 */
@Component({
  selector: 'mn-learning-data-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="rows" aria-labelledby="mn-learning-data-heading">
      <h2 id="mn-learning-data-heading" class="mn-visually-hidden">Your learning data</h2>

      <a class="row" routerLink="/vocabulary">
        <mn-icon name="vocabulary" [size]="20" />
        <span class="labels">
          <span class="title">Vocabulary</span>
          <span class="mn-hint">{{ vocabularyState() }}</span>
        </span>
        <mn-icon name="chevron-right" [size]="18" />
      </a>

      <a class="row" routerLink="/grammar">
        <mn-icon name="grammar" [size]="20" />
        <span class="labels">
          <span class="title">Grammar</span>
          <span class="mn-hint">{{ grammarState() }}</span>
        </span>
        <mn-icon name="chevron-right" [size]="18" />
      </a>
    </section>
  `,
  styles: `
    .rows {
      display: flex;
      flex-direction: column;
    }

    .row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
      text-decoration: none;
    }

    .row:first-child {
      border-top: 1px solid var(--border-subtle);
    }

    .labels {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }

    .title {
      font-weight: 500;
    }
  `,
})
export class LearningDataSectionComponent {
  private readonly snapshots = inject(SnapshotHistoryStore);
  private readonly grammar = inject(GrammarProfileStore);

  protected readonly vocabularyState = computed(() => {
    return formatVocabularyState(this.snapshots.active());
  });

  protected readonly grammarState = computed(
    () => this.grammar.selectedPreset()?.nameEn ?? 'Not loaded',
  );

  constructor() {
    void this.snapshots.load();
    void this.grammar.load();
  }
}
