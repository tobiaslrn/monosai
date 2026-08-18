import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { GuidanceSectionComponent } from './guidance-section.component';
import { PresetPickerComponent } from './preset-picker.component';

@Component({
  selector: 'mn-grammar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PresetPickerComponent, GuidanceSectionComponent],
  template: `
    <div class="mn-page">
      <header>
        <h1>Grammar</h1>
        <p class="mn-hint">
          Monosai uses this to pitch generated stories and to judge what is new to you in imported
          text. Changing it marks existing grammar analyses as stale.
        </p>
      </header>

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
      }

      @if (profile.lastError(); as error) {
        <p class="mn-error" role="alert">Your change could not be saved: {{ error.code }}</p>
      }
    </div>
  `,
})
export class GrammarPageComponent {
  protected readonly profile = inject(GrammarProfileStore);
  protected readonly language = inject(LanguageStore);

  constructor() {
    void this.language.initialize();
    void this.profile.load();
  }

  protected retry(): void {
    void this.language.initialize();
  }
}
