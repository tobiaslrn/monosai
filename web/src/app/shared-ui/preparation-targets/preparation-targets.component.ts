import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { SectionComponent } from '../section/section.component';
import { SwitchRowComponent } from '../switch-row/switch-row.component';

const LABELS: Readonly<Record<PreparationLayer, string>> = {
  english: 'English translation',
  grammar: 'Grammar notes',
  audio: 'Audio',
};

export function audioPreparationUnavailableReason(
  readiness: Exclude<ConfigurationReadiness, 'ready'>,
): string {
  switch (readiness) {
    case 'no-credential':
      return 'Add an OpenRouter key.';
    case 'incomplete':
      return 'Set up a voice.';
    case 'untested':
      return 'Test your voice.';
    case 'stale':
      return 'Test your voice again.';
    case 'failed':
      return 'Fix and test your voice.';
  }
}

@Component({
  selector: 'mn-preparation-targets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionComponent, SwitchRowComponent],
  template: `
    <mn-section [heading]="legend()" [rows]="true">
      <fieldset class="mn-settings-group" [disabled]="disabled()" [attr.aria-label]="legend()">
        @for (layer of layers; track layer) {
          <mn-switch-row
            [testId]="'preparation-' + layer"
            [checked]="isSelected(layer)"
            [disabled]="layer === 'audio' && audioReadiness() !== 'ready'"
            [description]="layer === 'audio' ? audioReason() : null"
            (checkedChange)="toggle(layer, $event)"
          >
            {{ labels[layer] }}
          </mn-switch-row>
        }
      </fieldset>
    </mn-section>
  `,
  styles: `
    :host {
      display: block;
    }

    fieldset {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
  `,
})
export class PreparationTargetsComponent {
  readonly targets = input.required<readonly PreparationLayer[]>();
  readonly audioReadiness = input<ConfigurationReadiness>('incomplete');
  readonly legend = input('Prepare this story');
  readonly disabled = input(false);
  readonly targetsChanged = output<readonly PreparationLayer[]>();

  protected readonly layers = ['english', 'grammar', 'audio'] as const;
  protected readonly labels = LABELS;
  protected readonly audioReason = computed(() => {
    const readiness = this.audioReadiness();
    return readiness === 'ready' ? null : audioPreparationUnavailableReason(readiness);
  });

  protected isSelected(layer: PreparationLayer): boolean {
    return this.targets().includes(layer);
  }

  protected toggle(layer: PreparationLayer, enabled: boolean): void {
    const selected = new Set(this.targets());
    if (enabled) selected.add(layer);
    else selected.delete(layer);
    this.targetsChanged.emit(this.layers.filter((candidate) => selected.has(candidate)));
  }
}
