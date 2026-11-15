import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';

/** The way to the grammar page, stating the reading level it is set to. */
@Component({
  selector: 'mn-grammar-row',
  host: { class: 'mn-settings-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row
      label="Grammar"
      end="nav"
      link="/grammar"
      testId="settings-grammar"
      [state]="settingsOriginState"
      [summary]="summary()"
    />
  `,
})
export class GrammarRowComponent {
  protected readonly settingsOriginState = navigationOriginState('/settings');
  private readonly grammar = inject(GrammarProfileStore);

  protected readonly summary = computed(() => this.grammar.selectedPreset()?.nameEn ?? null);

  constructor() {
    void this.grammar.load();
  }
}
