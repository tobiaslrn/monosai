import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
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
  imports: [IconComponent, ListRowComponent],
  template: `
    <mn-list-row
      [routerLink]="'/reading-level'"
      [state]="settingsOriginState"
      [testId]="'settings-reading-level'"
    >
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon name="vocabulary" [size]="20" />
      </span>
      <span mn-list-row-title>What you can read</span>
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
