import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import type { GrammarPreset, GrammarPresetId } from '../../domain/grammar/presets';
import { startSentence } from '../../domain/shared/locale';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The difficulty ladder.
 *
 * Learners choose by reading an example, which is reliable, rather than by
 * self-reporting grammar knowledge, which is not. The ladder stays scannable by
 * opening only the chosen card's example — choosing is a draft the page commits
 * separately, so tapping a card to read its example costs nothing. Preset names
 * never carry a JLPT level; the caption records only where the patterns are
 * conventionally taught.
 */
@Component({
  selector: 'mn-preset-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="presets" role="radiogroup" aria-label="Reading level">
      @for (preset of store.presets(); track preset.id) {
        <label class="preset" [class.is-selected]="isChosen(preset)">
          <input
            type="radio"
            name="grammar-preset"
            [value]="preset.id"
            [checked]="isChosen(preset)"
            (change)="selectedChange.emit(preset.id)"
          />
          <span class="body">
            <span class="name">{{ preset.nameEn }}</span>
            <span class="caption">{{ captionOf(preset) }}</span>
            <span class="description">{{ preset.descriptionEn }}</span>
            @if (isChosen(preset)) {
              <span class="example" lang="ja">{{ preset.exampleJa }}</span>
              <span class="gloss" lang="en">{{ preset.exampleEn }}</span>
            }
          </span>
          <mn-icon class="indicator" [name]="isChosen(preset) ? 'chevron-down' : 'chevron-right'" />
        </label>
      } @empty {
        <p class="mn-hint">Language assets are still loading.</p>
      }
    </div>
  `,
  styles: `
    .presets {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .preset {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      min-height: var(--touch-target);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      cursor: pointer;
      transition:
        background-color var(--motion-fast) ease-out,
        border-color var(--motion-fast) ease-out;
    }

    .preset:hover:not(.is-selected) {
      background: var(--surface-sunken);
    }

    .preset.is-selected {
      border-color: var(--action-primary);
      background: var(--surface-action-selected);
    }

    /* The keyboard's ring only: a tap or a click already shows as the selection. */
    .preset:has(input:focus-visible) {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .preset input {
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      margin-top: 0.1rem;
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      /* Without this the Japanese example cannot wrap and the card collapses. */
      min-width: 0;
      gap: 0.15rem;
    }

    .name {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .caption,
    .description,
    .gloss {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .example {
      margin-top: var(--space-2);
      font-family: var(--font-japanese);
      font-weight: var(--weight-semibold);
      line-height: 1.6;
    }

    .indicator {
      flex: none;
      margin-top: 0.15rem;
      color: var(--text-secondary);
    }
  `,
})
export class PresetPickerComponent {
  protected readonly store = inject(GrammarProfileStore);

  /** The preset shown as chosen, which the page owns until it saves it. */
  readonly selected = input<GrammarPresetId | null>(null);
  readonly selectedChange = output<GrammarPresetId>();

  protected isChosen(preset: GrammarPreset): boolean {
    return this.selected() === preset.id;
  }

  protected captionOf(preset: GrammarPreset): string {
    return startSentence(preset.captionEn);
  }
}
