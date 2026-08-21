import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { GuidanceSectionComponent } from './guidance-section.component';
import { PresetPickerComponent } from './preset-picker.component';
import { REGISTER_LABELS } from './register-labels';
import { StructuralBaselineSectionComponent } from './structural-baseline-section.component';

/** Appended to every confirmation; changing the profile is what makes analyses stale. */
const STALE_NOTICE = 'Existing grammar analyses are now out of date.';

@Component({
  selector: 'mn-grammar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    PresetPickerComponent,
    GuidanceSectionComponent,
    StructuralBaselineSectionComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Grammar" backTo="/settings" backLabel="Back to settings" />

      <p class="mn-hint">
        Monosai uses this to pitch generated stories and to judge what is new to you in imported
        text. Changing it marks existing grammar analyses as stale.
      </p>

      <!--
        Announced rather than shown as a toast: the change has already been saved,
        so this confirms what happened without asking for an acknowledgement.
      -->
      <p class="confirmation" role="status" aria-live="polite" data-testid="grammar-confirmation">
        {{ confirmation() }}
      </p>

      @if (language.status() === 'failed') {
        <section class="mn-panel" role="alert">
          <h2>Language assets are unavailable</h2>
          <p class="mn-hint">
            The reading levels ship with the language bundle, which could not be loaded. Your saved
            profile is unchanged.
          </p>
          <button type="button" (click)="retry()">Try again</button>
        </section>
      } @else {
        <section class="mn-panel" aria-labelledby="mn-grammar-level-heading">
          <h2 id="mn-grammar-level-heading">Your level</h2>
          <mn-preset-picker />
        </section>

        <section class="mn-panel" aria-labelledby="mn-grammar-wording-heading">
          <h2 id="mn-grammar-wording-heading">Register and wording</h2>
          <mn-guidance-section />
        </section>

        <section class="mn-panel" aria-labelledby="mn-grammar-baseline-heading">
          <h2 id="mn-grammar-baseline-heading">Always-known forms</h2>
          <mn-structural-baseline-section />
        </section>
      }

      @if (profile.lastError(); as error) {
        <p class="mn-error" role="alert">Your change could not be saved: {{ error.code }}</p>
      }
    </div>
  `,
  styles: `
    .confirmation:empty {
      display: none;
    }

    .confirmation {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class GrammarPageComponent {
  protected readonly profile = inject(GrammarProfileStore);
  protected readonly language = inject(LanguageStore);

  /**
   * One line naming what was saved.
   *
   * Empty until the learner changes something, so a screen reader is not handed
   * a stale announcement on arrival.
   */
  protected readonly confirmation = computed(() => {
    const change = this.profile.lastChange();
    if (change === null) {
      return '';
    }
    switch (change.kind) {
      case 'preset':
        return `Reading level set to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
      case 'register':
        return `Register set to ${REGISTER_LABELS[change.registerPreference]}. ${STALE_NOTICE}`;
      case 'custom-guidance':
        return `Your own wording saved. ${STALE_NOTICE}`;
      case 'reset-to-preset':
        return `Wording reset to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
    }
  });

  constructor() {
    void this.language.initialize();
    void this.profile.load();
  }

  protected retry(): void {
    void this.language.initialize();
  }

  private presetName(presetId: string): string {
    return this.profile.presets().find((preset) => preset.id === presetId)?.nameEn ?? presetId;
  }
}
