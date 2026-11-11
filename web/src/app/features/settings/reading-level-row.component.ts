import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
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
  host: { class: 'mn-settings-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row
      label="What you can read"
      end="nav"
      link="/reading-level"
      testId="settings-reading-level"
      [state]="settingsOriginState"
      [summary]="state()"
    />
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
