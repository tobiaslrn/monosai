import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TEXT_SCALE_STEP,
  type ReaderPreferences,
} from '../../domain/settings/settings';
import { IconComponent } from '../../shared-ui/icon/icon.component';

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
 * The panel is a native popover anchored to its own button, so dismissal by
 * `Escape` or a press outside, the top layer, and closing whenever another
 * header panel opens are all the platform's behaviour rather than three
 * listeners and a registry of our own.
 */
@Component({
  selector: 'mn-reader-aids',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div>
      <button type="button" class="mn-button anchor-button" popovertarget="mn-aids-panel">
        <mn-icon name="aids" [size]="18" />
        <span>Aids</span>
      </button>

      <div id="mn-aids-panel" popover class="panel" role="group" aria-label="Reading aids">
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
    </div>
  `,
  styles: `
    .anchor-button {
      anchor-name: --mn-aids-anchor;
    }

    /*
     * Positioned against the button rather than a wrapper, because a popover
     * is in the top layer and no longer has an ancestor to be absolute inside.
     */
    .panel {
      position: absolute;
      position-anchor: --mn-aids-anchor;
      /*
       * All-physical keywords: position-area refuses a mix of physical and
       * logical ones. The popover user-agent style pins inset to zero to centre
       * a dialog, which has to be released before the area applies.
       */
      position-area: bottom span-left;
      inset: auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: min(20rem, calc(100vw - 2 * var(--space-4)));
      margin: var(--space-2) 0 0;
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .panel:not(:popover-open) {
      display: none;
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
  protected readonly aids = AIDS;
  protected readonly minScale = MIN_TEXT_SCALE;
  protected readonly maxScale = MAX_TEXT_SCALE;
  protected readonly step = TEXT_SCALE_STEP;

  protected readonly scale = computed(() => this.settings.readerPreferences().textScale);

  /** A percentage rather than a bare multiplier, which reads as nothing. */
  protected readonly scaleLabel = computed(() => `${String(Math.round(this.scale() * 100))}%`);

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
