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
import { DialogGroupComponent } from '../../shared-ui/dialog-group/dialog-group.component';
import { RangeFieldComponent } from '../../shared-ui/range-field/range-field.component';
import { StatusLineComponent } from '../../shared-ui/status-line/status-line.component';
import { SwitchRowComponent } from '../../shared-ui/switch-row/switch-row.component';

type AidToggle = 'furigana' | 'tokenSpacing' | 'sentencePerLine' | 'warningMarkers';

interface AidOption {
  readonly key: AidToggle;
  readonly label: string;
}

/** Labels only: each names the thing it switches, which is the whole message. */
const AIDS: readonly AidOption[] = [
  { key: 'furigana', label: 'Furigana' },
  { key: 'tokenSpacing', label: 'Word spacing' },
  { key: 'sentencePerLine', label: 'Sentence per line' },
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
  imports: [
    DialogGroupComponent,
    RangeFieldComponent,
    RouterLink,
    StatusLineComponent,
    SwitchRowComponent,
  ],
  template: `
    <mn-dialog-group heading="Reading appearance">
      <mn-range-field
        label="Text size"
        testId="text-scale"
        [min]="minScale"
        [max]="maxScale"
        [step]="step"
        [value]="scale()"
        [valueLabel]="scaleLabel()"
        (valueChange)="setScale($event)"
      />
      @for (aid of aids; track aid.key) {
        <mn-switch-row
          [checked]="settings.readerPreferences()[aid.key]"
          (checkedChange)="setAid(aid.key, $event)"
        >
          {{ aid.label }}
        </mn-switch-row>
      }
      @if (vocabularyNotice(); as notice) {
        <mn-status-line
          [tone]="vocabularyUnreadable() ? 'warning' : 'setup'"
          data-testid="reader-vocabulary-notice"
        >
          {{ notice }}
          <a mn-status-line-action routerLink="/reading-level" fragment="words"
            >What you can read</a
          >
        </mn-status-line>
      }
    </mn-dialog-group>
  `,
  styles: `
    :host {
      display: block;
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
  /** Words that could not be read make the marking wrong; no words is a step still to take. */
  protected readonly vocabularyUnreadable = computed(
    () => this.vocabulary.state().kind === 'unavailable',
  );

  protected readonly vocabularyNotice = computed(() => {
    const state = this.vocabulary.state();
    switch (state.kind) {
      case 'unknown':
        return null;
      case 'unavailable':
        return `Your words could not be read, so word marking may be wrong here. ${state.message}`;
      case 'known':
        switch (state.availability) {
          case 'ready':
            return null;
          case 'empty':
            return 'Your word sources have no words in them, so every word here is marked as new.';
          case 'none':
            return 'You have no words yet, so no word here is marked as new.';
        }
    }
  });

  constructor() {
    void this.vocabulary.refresh();
  }

  protected setAid(key: AidToggle, enabled: boolean): void {
    void this.settings.setReaderPreference(key, enabled);
  }

  protected setScale(value: number): void {
    void this.settings.setReaderPreference(
      'textScale' satisfies keyof ReaderPreferences,
      Number.isFinite(value) ? value : 1,
    );
  }
}
