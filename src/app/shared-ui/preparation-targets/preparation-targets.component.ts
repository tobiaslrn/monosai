import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';

let instanceCount = 0;

const LABELS: Readonly<Record<PreparationLayer, string>> = {
  english: 'English',
  grammar: 'Grammar notes',
  audio: 'Audio',
};

export function audioPreparationUnavailableReason(
  readiness: Exclude<ConfigurationReadiness, 'ready'>,
): string {
  switch (readiness) {
    case 'not-configured':
      return 'Set up a voice to prepare audio.';
    case 'untested':
      return 'Test your voice setup to prepare audio.';
    case 'stale':
      return 'Retest your changed voice setup to prepare audio.';
    case 'failed':
      return 'Fix and test your voice setup to prepare audio.';
  }
}

@Component({
  selector: 'mn-preparation-targets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [disabled]="disabled()">
      <legend>{{ legend() }}</legend>
      @for (layer of layers; track layer) {
        <label [class.is-disabled]="layer === 'audio' && audioReadiness() !== 'ready'">
          <span>{{ labels[layer] }}</span>
          <input
            type="checkbox"
            role="switch"
            [attr.data-testid]="'preparation-' + layer"
            [checked]="isSelected(layer)"
            [disabled]="layer === 'audio' && audioReadiness() !== 'ready'"
            [attr.aria-describedby]="layer === 'audio' ? audioReasonId : null"
            (change)="toggle(layer, $event)"
          />
        </label>
      }
      @if (audioReason(); as reason) {
        <p [id]="audioReasonId" class="reason">{{ reason }}</p>
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }

    fieldset {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      margin-bottom: var(--space-2);
      /* The user-agent inline padding would indent the group from its siblings. */
      padding: 0;
      color: var(--text-primary);
      font-size: var(--text-sm);
      font-weight: 600;
    }

    label {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      justify-content: space-between;
      min-height: var(--touch-target);
      color: var(--text-primary);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    label.is-disabled {
      color: var(--text-secondary);
      cursor: not-allowed;
    }

    input {
      position: relative;
      width: 2.75rem;
      height: 1.5rem;
      margin: 0;
      flex: 0 0 auto;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      appearance: none;
      background: var(--surface-sunken);
      cursor: pointer;
      transition:
        background-color var(--motion-fast),
        border-color var(--motion-fast);
    }

    input::after {
      position: absolute;
      top: 0.1875rem;
      left: 0.1875rem;
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      background: var(--text-secondary);
      content: '';
      transition: transform var(--motion-fast);
    }

    input:checked {
      border-color: var(--action-primary);
      background: var(--action-primary);
    }

    input:checked::after {
      background: var(--surface-raised);
      transform: translateX(1.25rem);
    }

    input:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    input:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .reason {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-xs);
      line-height: 1.4;
    }

    @media (prefers-reduced-motion: reduce) {
      input,
      input::after {
        transition: none;
      }
    }
  `,
})
export class PreparationTargetsComponent {
  readonly targets = input.required<readonly PreparationLayer[]>();
  readonly audioReadiness = input<ConfigurationReadiness>('not-configured');
  readonly legend = input('Prepare for this reading');
  readonly disabled = input(false);
  readonly targetsChanged = output<readonly PreparationLayer[]>();

  protected readonly layers = ['english', 'grammar', 'audio'] as const;
  protected readonly labels = LABELS;
  /** Own id, so several mounted groups never collide on one description id. */
  protected readonly audioReasonId = `mn-preparation-audio-reason-${(instanceCount += 1)}`;
  protected readonly audioReason = computed(() => {
    const readiness = this.audioReadiness();
    return readiness === 'ready' ? null : audioPreparationUnavailableReason(readiness);
  });

  protected isSelected(layer: PreparationLayer): boolean {
    return this.targets().includes(layer);
  }

  protected toggle(layer: PreparationLayer, event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    const selected = new Set(this.targets());
    if (enabled) selected.add(layer);
    else selected.delete(layer);
    this.targetsChanged.emit(this.layers.filter((candidate) => selected.has(candidate)));
  }
}
