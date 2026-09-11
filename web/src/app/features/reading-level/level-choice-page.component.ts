import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import type { GrammarPresetId } from '../../domain/grammar/presets';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { PresetPickerComponent } from '../grammar/preset-picker.component';

/**
 * Choosing a reading level.
 *
 * The ladder is a page of its own because changing the level makes every
 * grammar analysis stale: tapping through the cards to read their examples is
 * free, and only Save level commits the choice. Leaving without saving keeps
 * the level that was there.
 */
@Component({
  selector: 'mn-level-choice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PresetPickerComponent],
  template: `
    <div class="mn-page choice-page">
      <mn-page-header
        heading="Reading level"
        backTo="/reading-level"
        backLabel="Back to what you can read"
      />

      @if (language.status() === 'failed') {
        <div class="mn-card assets-failed" role="alert">
          <h2>Language assets are unavailable</h2>
          <p class="mn-hint">Reading levels could not be loaded. Your saved level is unchanged.</p>
          <button type="button" class="mn-button" (click)="retryLanguage()">Try again</button>
        </div>
      } @else {
        <mn-preset-picker [selected]="draft()" (selectedChange)="choose($event)" />

        @if (profile.lastError()) {
          <p class="mn-notice mn-notice--error" role="alert">
            Your level could not be saved. The level you had is unchanged.
          </p>
        }

        <div class="save-bar">
          <button
            type="button"
            class="mn-button mn-button--primary"
            [disabled]="draft() === null || saving()"
            (click)="save()"
            data-testid="save-level"
          >
            {{ saving() ? 'Saving…' : 'Save level' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .choice-page {
      gap: var(--space-4);
    }

    /*
     * The commit stays within reach at the foot of the viewport while the
     * ladder scrolls under it, fading into the canvas rather than cutting it.
     */
    .save-bar {
      position: sticky;
      bottom: 0;
      margin-top: calc(var(--space-2) * -1);
      padding: var(--space-4) 0 calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
      background: linear-gradient(to top, var(--surface-canvas) 72%, transparent);
    }

    .save-bar > .mn-button {
      width: 100%;
    }

    .assets-failed {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      padding: var(--space-4);
    }

    .assets-failed h2,
    .assets-failed p {
      margin: 0;
    }

    .assets-failed h2 {
      font-size: var(--text-lg);
    }
  `,
})
export class LevelChoicePageComponent {
  protected readonly profile = inject(GrammarProfileStore);
  protected readonly language = inject(LanguageStore);
  private readonly navigation = inject(NavigationHistoryService);

  private readonly chosen = signal<GrammarPresetId | null>(null);
  protected readonly saving = signal(false);

  /** What the learner picked here, or the saved level until they pick. */
  protected readonly draft = computed<GrammarPresetId | null>(() => {
    const chosen = this.chosen();
    if (chosen !== null) {
      return chosen;
    }
    return this.profile.presets().length === 0 ? null : this.profile.selection().presetId;
  });

  constructor() {
    void this.language.initialize();
    void this.profile.load();
  }

  protected choose(presetId: GrammarPresetId): void {
    this.chosen.set(presetId);
  }

  protected retryLanguage(): void {
    void this.language.initialize();
  }

  /** Commits the draft, then returns to the page that states it. */
  protected async save(): Promise<void> {
    const presetId = this.draft();
    if (presetId === null || this.saving()) {
      return;
    }
    if (presetId !== this.profile.selection().presetId) {
      this.saving.set(true);
      await this.profile.selectPreset(presetId);
      this.saving.set(false);
      // The store keeps the old selection when the write fails and reports why
      // in its error, which this page shows; staying lets the learner retry.
      if (this.profile.selection().presetId !== presetId) {
        return;
      }
    }
    await this.navigation.backOrNavigate('/reading-level');
  }
}
