import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { vocabularyCountLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * A signpost, not a setting.
 *
 * What the learner can read has its own page and its own way in from the
 * Library, which is where it belongs: filing it under a gear is what made it
 * invisible ([ADR 0049](../../../../../docs/decisions/0049-one-page-for-what-you-can-read.md)).
 * But connecting an external application is something people come to Settings
 * looking for, so this points at that page from here rather than leaving anyone
 * who searched the obvious place concluding it does not exist.
 *
 * It is one row that states its current value, not a panel of the learner's
 * data: the page it leads to owns that.
 */
@Component({
  selector: 'mn-reading-level-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <a
      class="row"
      routerLink="/reading-level"
      [state]="settingsOriginState"
      data-testid="settings-reading-level"
    >
      <mn-icon name="vocabulary" [size]="20" />
      <span class="labels">
        <span class="title">What you can read</span>
        <span class="mn-hint">{{ state() }}</span>
      </span>
      <mn-icon name="chevron-right" [size]="18" />
    </a>
  `,
  styles: `
    /*
     * A panel like every other section on this page, so a signpost among boxes
     * does not read as something that fell out of one. It is a single link, so
     * the whole card is the control and the hover states say so.
     */
    .row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-4) var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      color: var(--text-primary);
      text-decoration: none;
    }

    .row:hover {
      border-color: var(--border-strong);
    }

    .row:hover .title {
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      .row {
        padding: var(--space-4);
      }
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
export class ReadingLevelRowComponent {
  protected readonly settingsOriginState = navigationOriginState('/settings');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly grammar = inject(GrammarProfileStore);

  /** The same two facts the Library states, in one line rather than two. */
  protected readonly state = computed(() => {
    const preset = this.grammar.selectedPreset()?.nameEn;
    const parts = [this.wordsLabel(), preset];
    return parts.filter((part) => part !== null && part !== undefined).join(' · ');
  });

  constructor() {
    void this.vocabulary.refresh();
    void this.grammar.load();
  }

  private wordsLabel(): string | null {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return 'Your words could not be read';
      case 'known':
        return state.snapshot === null || state.snapshot.uniqueEntryCount === 0
          ? 'No words yet'
          : vocabularyCountLabel(state.snapshot.uniqueEntryCount);
    }
  }
}
