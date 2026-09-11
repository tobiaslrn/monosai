import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import {
  vocabularyCountLabel,
  vocabularySourceSummary,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * Settings' first row: the words Monosai writes from, and the level.
 *
 * The page it opens is also reached from Home's standing line
 * ([ADR 0070](../../../../../docs/decisions/0070-home-library-and-settings-are-tabs.md)),
 * but connecting an external application is something people come to Settings
 * looking for, so it leads here too rather than leaving anyone who searched the
 * obvious place concluding it does not exist.
 *
 * It is one row that states its current value, not a panel of the learner's
 * data: the page it leads to owns that.
 */
@Component({
  selector: 'mn-reading-level-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ListRowComponent],
  template: `
    <mn-list-row
      [routerLink]="'/reading-level'"
      [state]="settingsOriginState"
      [testId]="'settings-reading-level'"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon name="vocabulary" [size]="18" />
      </span>
      <span mn-list-row-title>Words and level</span>
      @if (state(); as line) {
        <span mn-list-row-meta>{{ line }}</span>
      }
      <mn-icon mn-list-row-trailing name="chevron-right" [size]="18" />
    </mn-list-row>
  `,
})
export class ReadingLevelRowComponent {
  protected readonly settingsOriginState = navigationOriginState('/settings');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  private readonly grammar = inject(GrammarProfileStore);

  /**
   * The count, the level, and where the words came from, in one line. A part
   * that has not answered yet is left out rather than held open.
   */
  protected readonly state = computed(() => {
    const preset = this.grammar.selectedPreset()?.nameEn;
    const parts = [this.wordsLabel(), preset, this.sourceLabel()];
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

  /** Only a snapshot with words in it has a source worth naming. */
  private sourceLabel(): string | null {
    const state = this.vocabulary.state();
    if (state.kind !== 'known' || state.snapshot === null) {
      return null;
    }
    return state.snapshot.uniqueEntryCount === 0
      ? null
      : vocabularySourceSummary(state.snapshot.sourceKinds);
  }
}
