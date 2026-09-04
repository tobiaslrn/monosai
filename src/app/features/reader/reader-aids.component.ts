import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TEXT_SCALE_STEP,
  type ReaderPreferences,
} from '../../domain/settings/settings';

type AidToggle = 'furigana' | 'tokenSpacing' | 'warningMarkers';

interface AidOption {
  readonly key: AidToggle;
  readonly label: string;
}

/** Labels only: each names the thing it switches, which is the whole message. */
const AIDS: readonly AidOption[] = [
  { key: 'furigana', label: 'Furigana' },
  { key: 'tokenSpacing', label: 'Word spacing' },
  { key: 'warningMarkers', label: 'Warning markers' },
];

/**
 * Reading aid switches and the text scale.
 *
 * These are device-wide preferences, not per-reading settings: changing one
 * here applies to every open and future reading immediately.
 *
 * Embedded in Story options, alongside the reading's saved content.
 */
@Component({
  selector: 'mn-reader-aids',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="appearance" role="group" aria-label="Reading appearance">
      <h3>Reading appearance</h3>
      <div class="scale">
        <label for="mn-text-scale">Text size</label>
        <input
          id="mn-text-scale"
          type="range"
          [min]="minScale"
          [max]="maxScale"
          [step]="step"
          [value]="scale()"
          [attr.aria-valuetext]="scaleLabel()"
          (input)="setScale($event)"
        />
        <span class="scale-value" aria-hidden="true">{{ scaleLabel() }}</span>
      </div>

      <div class="switches">
        @for (aid of aids; track aid.key) {
          <label class="aid">
            <input
              type="checkbox"
              [checked]="settings.readerPreferences()[aid.key]"
              (change)="toggleAid(aid.key, $event)"
            />
            <span>{{ aid.label }}</span>
          </label>
        }
      </div>
      @if (vocabularyNotice(); as notice) {
        <p class="vocabulary-notice" data-testid="reader-vocabulary-notice">
          {{ notice }}
          <a routerLink="/vocabulary">Vocabulary settings</a>
        </p>
      }
    </section>
  `,
  styles: `
    .appearance {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    h3 {
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 600;
    }
    .switches {
      display: flex;
      flex-wrap: wrap;
      column-gap: var(--space-3);
    }
    .scale input {
      min-width: 0;
    }
    .scale,
    .aid {
      font-size: var(--text-sm);
    }
    :host {
      display: block;
    }

    .scale {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
    }

    .scale input {
      width: 100%;
    }

    .scale-value {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }

    .vocabulary-notice {
      margin: 0;
      padding: var(--space-2);
      border-radius: var(--radius-control);
      background: var(--status-warning-soft);
      color: var(--text-primary);
      font-size: var(--text-sm);
    }

    .aid {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-1);
      cursor: pointer;
    }
  `,
})
export class ReaderAidsComponent {
  protected readonly settings = inject(AppSettingsStore);
  private readonly vocabulary = inject(VocabularyAvailabilityStore);
  protected readonly aids = AIDS;
  protected readonly minScale = MIN_TEXT_SCALE;
  protected readonly maxScale = MAX_TEXT_SCALE;
  protected readonly step = TEXT_SCALE_STEP;

  protected readonly scale = computed(() => this.settings.readerPreferences().textScale);

  /** A percentage rather than a bare multiplier, which reads as nothing. */
  protected readonly scaleLabel = computed(() => `${String(Math.round(this.scale() * 100))}%`);

  /**
   * Why the markers look the way they do, when the reason is not the text.
   *
   * Marking is derived from the current vocabulary, so losing that vocabulary
   * silently repaints every reading — including a story generated from those
   * very words. This says so beside the switch that draws the markers, which is
   * the control a learner reaches for when the page suddenly looks wrong.
   */
  protected readonly vocabularyNotice = computed(() => {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return `Your vocabulary could not be read, so word marking may be wrong here. ${state.message}`;
      case 'known':
        switch (state.availability) {
          case 'ready':
            return null;
          case 'empty':
            return 'Your vocabulary has no words in it, so every word here is marked as new.';
          case 'none':
            return 'You have no vocabulary yet, so no word here is marked as new.';
        }
    }
  });

  constructor() {
    void this.vocabulary.refresh();
  }

  protected toggleAid(key: AidToggle, event: Event): void {
    void this.settings.setReaderPreference(key, (event.target as HTMLInputElement).checked);
  }

  protected setScale(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    void this.settings.setReaderPreference(
      'textScale' satisfies keyof ReaderPreferences,
      Number.isFinite(value) ? value : 1,
    );
  }
}
