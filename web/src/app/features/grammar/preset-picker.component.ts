import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import type { GrammarPreset, GrammarPresetId } from '../../domain/grammar/presets';
import { startSentence } from '../../domain/shared/locale';
import { ExampleComponent } from '../../shared-ui/example/example.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { RadioCardComponent } from '../../shared-ui/radio-card/radio-card.component';
import { RadioCardGroupComponent } from '../../shared-ui/radio-card/radio-card-group.component';

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
  imports: [ExampleComponent, IconComponent, RadioCardComponent, RadioCardGroupComponent],
  template: `
    <mn-radio-card-group
      label="Reading level"
      [value]="selected() ?? undefined"
      (valueChange)="onChange($event)"
    >
      @for (preset of store.presets(); track preset.id) {
        <mn-radio-card [value]="preset.id">
          <span class="name">{{ preset.nameEn }}</span>
          <span class="caption">{{ captionOf(preset) }}</span>
          <span class="description">{{ preset.descriptionEn }}</span>
          @if (selected() === preset.id) {
            <mn-example [ja]="preset.exampleJa" [en]="preset.exampleEn" />
          }
          <mn-icon
            mn-radio-card-end
            class="indicator mn-lead"
            [name]="selected() === preset.id ? 'chevron-down' : 'chevron-right'"
          />
        </mn-radio-card>
      } @empty {
        <p class="mn-hint">Loading levels…</p>
      }
    </mn-radio-card-group>
  `,
  styles: `
    .name {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .caption,
    .description {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .indicator {
      color: var(--text-secondary);
      font-size: var(--text-lg);
    }
  `,
})
export class PresetPickerComponent {
  protected readonly store = inject(GrammarProfileStore);

  /** The preset shown as chosen, which the page owns until it saves it. */
  readonly selected = input<GrammarPresetId | null>(null);
  readonly selectedChange = output<GrammarPresetId>();

  protected onChange(id: GrammarPresetId | undefined): void {
    if (id !== undefined) {
      this.selectedChange.emit(id);
    }
  }

  protected captionOf(preset: GrammarPreset): string {
    return startSentence(preset.captionEn);
  }
}
