import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CapabilityState } from '../../application/settings/model-capabilities.store';
import { aiErrorCopy } from '../../shared-ui/ai-error/ai-error-copy';

@Component({
  selector: 'mn-model-capabilities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().action === 'loading') {
      <p class="mn-hint" role="status">Looking up model details…</p>
    } @else if (state().result; as model) {
      <div class="details" data-testid="model-capabilities" role="status">
        <div class="found-row">
          <span class="check" aria-hidden="true">✓</span>
          <div>
            <strong>{{ model.name }}</strong
            ><span>{{ model.modelId }}</span>
          </div>
        </div>
        <div class="chips" aria-label="Model summary">
          <span
            >{{ model.inputModalities.join(' + ') }} →
            {{ model.outputModalities.join(' + ') }}</span
          >
          @if (model.contextLength !== null) {
            <span>{{ model.contextLength.toLocaleString() }} tokens</span>
          }
          @if (model.supportedVoices.length > 0) {
            <span>{{ model.supportedVoices.length }} voices</span>
          }
        </div>
        <details class="mn-disclosure">
          <summary>Technical details</summary>
          <div class="technical">
            @if (model.reasoning; as reasoning) {
              <p>
                <strong>Reasoning:</strong>
                {{ reasoning.supportedEfforts?.join(', ') || 'supported' }}
                @if (reasoning.defaultEffort !== null) {
                  · default {{ reasoning.defaultEffort }}
                }
                @if (reasoning.mandatory) {
                  · required
                }
              </p>
            } @else {
              <p><strong>Reasoning:</strong> not advertised</p>
            }
            @if (model.supportedVoices.length > 0) {
              <p><strong>Voices:</strong> {{ model.supportedVoices.join(', ') }}</p>
            }
            <p>
              <strong>Parameters:</strong>
              {{ model.supportedParameters.join(', ') || 'none listed' }}
            </p>
            <p class="mn-hint">
              OpenRouter metadata is advisory. The configuration test is authoritative.
            </p>
          </div>
        </details>
      </div>
    } @else if (state().failure; as failure) {
      <p class="warning" role="alert">{{ copy(failure).whatFailed }}</p>
    }
  `,
  styles: `
    .details {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--action-primary-soft);
    }

    .found-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .found-row div {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }
    .found-row span:not(.check) {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }
    .check {
      display: grid;
      flex: 0 0 auto;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border-radius: 50%;
      background: var(--status-success);
      color: var(--text-on-action);
      font-weight: 700;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .chips span {
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      background: var(--surface-panel);
      font-size: var(--text-sm);
    }
    .technical {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding-top: var(--space-2);
    }
    .details p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .warning {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class ModelCapabilitiesComponent {
  readonly state = input.required<CapabilityState>();
  protected copy = aiErrorCopy;
}
