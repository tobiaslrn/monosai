import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { ReaderPreferences, ThemeSetting } from '../../domain/settings/settings';

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type ReaderAid = keyof Omit<ReaderPreferences, 'updatedAt'>;

const READER_AIDS: readonly { key: ReaderAid; label: string; hint: string }[] = [
  { key: 'furigana', label: 'Furigana', hint: 'Show readings above words that have one.' },
  { key: 'tokenSpacing', label: 'Token spacing', hint: 'Add space between words while reading.' },
  { key: 'statusMarkers', label: 'Status markers', hint: 'Underline words by vocabulary status.' },
  {
    key: 'translationsExpanded',
    label: 'Show saved translations',
    hint: 'Expand translations that are already saved.',
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
  `,
})
export class AppearanceSectionComponent {
  protected readonly settings = inject(AppSettingsStore);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly readerAids = READER_AIDS;

  protected selectTheme(theme: ThemeSetting): void {
    void this.settings.setTheme(theme);
  }

  protected toggleAid(aid: ReaderAid, event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.settings.setReaderPreference(aid, input.checked);
  }
}
