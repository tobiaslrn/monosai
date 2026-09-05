import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import type { GrammarPresetId } from '../../domain/grammar/presets';

/**
 * The difficulty ladder.
 *
 * Each card leads with a real Japanese sentence: learners choose by reading an
 * example, which is reliable, rather than by self-reporting grammar knowledge,
 * which is not. Preset names never carry a JLPT level; the caption records only
 * where the patterns are conventionally taught.
 */
@Component({
  selector: 'mn-preset-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Reading level</legend>
      <p class="mn-hint">
        Pick the hardest example you can read comfortably. This shapes the Japanese Monosai
        generates for you, and what it treats as new when you analyse imported text.
      </p>

      <div class="presets" role="radiogroup" aria-label="Reading level">
        @for (preset of store.presets(); track preset.id) {
          <label class="preset" [class.is-selected]="store.selection().presetId === preset.id">
            <input
              type="radio"
              name="grammar-preset"
              [value]="preset.id"
              [checked]="store.selection().presetId === preset.id"
              (change)="select(preset.id)"
            />
            <span class="body">
              <span class="heading">
                <span class="name">{{ preset.nameEn }}</span>
                <span class="caption">{{ preset.captionEn }}</span>
              </span>
              <span class="mn-hint">{{ preset.descriptionEn }}</span>
              <span class="example" lang="ja">{{ preset.exampleJa }}</span>
              <span class="gloss" lang="en">{{ preset.exampleEn }}</span>
            </span>
          </label>
        } @empty {
          <p class="mn-hint">Language assets are still loading.</p>
        }
      </div>
    </fieldset>
  `,
  styles: `
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
    }

    .presets {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .preset {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      min-height: 44px;
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      cursor: pointer;
    }

    .preset.is-selected {
      border-color: var(--action-primary);
      background: var(--surface-raised);
    }

    .preset:focus-within {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .preset input {
      flex: none;
      margin-top: 0.2em;
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      /* Without this the Japanese example cannot wrap and the card collapses. */
      min-width: 0;
      gap: var(--space-1);
    }

    .heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: baseline;
    }

    .name {
      font-weight: 600;
    }

    .caption {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .example {
      margin-top: var(--space-1);
      font-size: var(--text-lg);
    }

    .gloss {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
  `,
})
export class PresetPickerComponent {
  protected readonly store = inject(GrammarProfileStore);

  protected select(presetId: GrammarPresetId): void {
    void this.store.selectPreset(presetId);
  }
}
