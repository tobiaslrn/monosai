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
  imports: [IconComponent, RouterLink],
  template: `
    <div>
      <button
        type="button"
        class="mn-icon-button anchor-button"
        popovertarget="mn-aids-panel"
        [attr.aria-label]="
          vocabularyNotice() === null ? 'Aids' : 'Aids, with a note about word marking'
        "
      >
        <mn-icon name="aids" />
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

        @if (vocabularyNotice(); as notice) {
          <p class="vocabulary-notice" data-testid="reader-vocabulary-notice">
            {{ notice }}
            <a routerLink="/vocabulary">Vocabulary settings</a>
          </p>
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
