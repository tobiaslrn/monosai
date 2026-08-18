import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { ReaderPreferences } from '../../domain/settings/settings';
import { IconComponent } from '../../shared-ui/icon/icon.component';

type AidKey = keyof Omit<ReaderPreferences, 'updatedAt'>;

interface AidOption {
  readonly key: AidKey;
  readonly label: string;
  readonly description: string;
}

const AIDS: readonly AidOption[] = [
  { key: 'furigana', label: 'Furigana', description: 'Readings above words that contain kanji.' },
  { key: 'tokenSpacing', label: 'Word spacing', description: 'Extra space between words.' },
  {
    key: 'statusMarkers',
    label: 'Status markers',
    description: 'Underlines showing what you know.',
  },
  {
    key: 'translationsExpanded',
    label: 'Show saved translations',
    description: 'Expand translations you already have.',
  },
];

/**
 * Reading aid switches.
 *
 * These are device-wide preferences, not per-reading settings: changing one
 * here applies to every open and future reading immediately.
 */
@Component({
  selector: 'mn-reader-aids',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="anchor">
      <button
        type="button"
        class="mn-button"
        [attr.aria-expanded]="open()"
        aria-controls="mn-aids-panel"
        (click)="toggle()"
      >
        <mn-icon name="aids" [size]="18" />
        <span>Aids</span>
      </button>

      @if (open()) {
        <div id="mn-aids-panel" class="panel" role="group" aria-label="Reading aids">
          <p class="mn-hint">These apply to every reading on this device.</p>
          @for (aid of aids; track aid.key) {
            <label class="aid">
              <input
                type="checkbox"
                [checked]="settings.readerPreferences()[aid.key]"
                (change)="toggleAid(aid.key, $event)"
              />
              <span class="text">
                <span class="label">{{ aid.label }}</span>
                <span class="mn-hint">{{ aid.description }}</span>
              </span>
            </label>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .anchor {
      position: relative;
    }

    .panel {
      position: absolute;
      z-index: 5;
      inset-inline-end: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: min(20rem, calc(100vw - 2 * var(--space-4)));
      margin-top: var(--space-2);
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .aid {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      min-height: var(--touch-target);
      padding: var(--space-1);
      cursor: pointer;
    }

    .aid input {
      margin-top: 0.25em;
    }

    .text {
      display: flex;
      flex-direction: column;
    }

    .label {
      font-weight: 500;
    }
  `,
})
export class ReaderAidsComponent {
  protected readonly settings = inject(AppSettingsStore);
  protected readonly aids = AIDS;

  private readonly openSignal = signal(false);
  protected readonly open = this.openSignal.asReadonly();

  protected toggle(): void {
    this.openSignal.update((open) => !open);
  }

  protected toggleAid(key: AidKey, event: Event): void {
    void this.settings.setReaderPreference(key, (event.target as HTMLInputElement).checked);
  }
}
