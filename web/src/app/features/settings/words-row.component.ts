import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { vocabularyCountLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/**
 * A signpost, not a setting.
 *
 * The words have their own page and their own way in from the Library. But
 * connecting an external application is something people come to Settings
 * looking for, so this points at that page from here rather than leaving anyone
 * who searched the obvious place concluding it does not exist.
 *
 * It is one row that states its current value, not a panel of the learner's
 * data: the page it leads to owns that.
 */
@Component({
  selector: 'mn-words-row',
  host: { class: 'mn-settings-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row
      label="Words"
      end="nav"
      link="/words"
      testId="settings-words"
      [state]="settingsOriginState"
      [summary]="summary()"
    />
  `,
})
export class WordsRowComponent {
  protected readonly settingsOriginState = navigationOriginState('/settings');
  private readonly vocabulary = inject(VocabularyAvailabilityStore);

  /** The same fact the Library states; nothing until the read answers. */
  protected readonly summary = computed(() => {
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
  });

  constructor() {
    void this.vocabulary.refresh();
  }
}
