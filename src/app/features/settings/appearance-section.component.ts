import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TEXT_SCALE_STEP,
  type ReaderPreferences,
  type ThemeSetting,
} from '../../domain/settings/settings';

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** The boolean aids. Text scale is a range and is rendered on its own. */
type ReaderAid = keyof Omit<ReaderPreferences, 'updatedAt' | 'textScale'>;

const READER_AIDS: readonly { key: ReaderAid; label: string; hint: string }[] = [
  { key: 'furigana', label: 'Furigana', hint: 'Show readings above words that have one.' },
  { key: 'tokenSpacing', label: 'Token spacing', hint: 'Add space between words while reading.' },
  {
    key: 'warningMarkers',
    label: 'Warning markers',
    hint: 'Underline unreviewed words and grammar you may not know. Nothing else is marked.',
  },
];

/** Appearance and global reader aids. Changes apply to every reading at once. */
@Component({
  selector: 'mn-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-appearance-heading">
      <h2 id="mn-appearance-heading">Appearance and reading</h2>

      <fieldset>
        <legend>Theme</legend>
        <div class="options">
          @for (option of themeOptions; track option.value) {
            <label>
              <input
                type="radio"
                name="theme"
                [value]="option.value"
                [checked]="settings.theme() === option.value"
                (change)="selectTheme(option.value)"
              />
              <span>{{ option.label }}</span>
            </label>
          }
        </div>
        <p class="mn-hint">System follows your device's light or dark setting.</p>
      </fieldset>

      <fieldset>
        <legend>Reading size</legend>
        <div class="scale">
          <input
            id="mn-appearance-text-scale"
            type="range"
            [min]="minScale"
            [max]="maxScale"
            [step]="step"
            [value]="settings.readerPreferences().textScale"
            aria-label="Text size"
            [attr.aria-valuetext]="scaleLabel()"
            (input)="setScale($event)"
          />
          <span aria-hidden="true">{{ scaleLabel() }}</span>
        </div>
        <p class="mn-hint">Line spacing follows the text size, within limits.</p>
      </fieldset>

      <fieldset>
        <legend>Reader aids</legend>
        <div class="aids">
          @for (aid of readerAids; track aid.key) {
            <label class="aid">
              <input
                type="checkbox"
                [checked]="settings.readerPreferences()[aid.key]"
                (change)="toggleAid(aid.key, $event)"
              />
              <span>
                <span class="aid-label">{{ aid.label }}</span>
                <span class="mn-hint">{{ aid.hint }}</span>
              </span>
            </label>
          }
        </div>
      </fieldset>
    </section>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      padding: 0;
      font-weight: 500;
    }

    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .aids {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    label {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      cursor: pointer;
    }

    .aid span {
      display: flex;
      flex-direction: column;
    }

    .aid-label {
      font-weight: 500;
    }

    .scale {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
    }

    .scale input {
      flex: 1;
      max-width: 20rem;
    }

    .scale span {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AppearanceSectionComponent {
  protected readonly settings = inject(AppSettingsStore);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly readerAids = READER_AIDS;
  protected readonly minScale = MIN_TEXT_SCALE;
  protected readonly maxScale = MAX_TEXT_SCALE;
  protected readonly step = TEXT_SCALE_STEP;

  /** A percentage rather than a bare multiplier, which reads as nothing. */
  protected readonly scaleLabel = computed(
    () => `${String(Math.round(this.settings.readerPreferences().textScale * 100))}%`,
  );

  protected setScale(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    void this.settings.setReaderPreference('textScale', Number.isFinite(value) ? value : 1);
  }

  protected selectTheme(theme: ThemeSetting): void {
    void this.settings.setTheme(theme);
  }

  protected toggleAid(aid: ReaderAid, event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.settings.setReaderPreference(aid, input.checked);
  }
}
