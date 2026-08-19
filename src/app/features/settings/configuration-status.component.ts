import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import { technicalCode } from '../../domain/shared/errors';
import { aiErrorCopy } from '../../shared-ui/ai-error/ai-error-copy';

interface ReadinessLabel {
  readonly text: string;
  readonly tone: 'neutral' | 'positive' | 'warning';
}

/**
 * Words for each readiness state.
 *
 * `stale` and `untested` are kept apart here as well as in the domain, because
 * "you changed something" and "this has never been tried" send the learner to
 * different places.
 */
const LABELS: Record<ConfigurationReadiness, ReadinessLabel> = {
  'not-configured': { text: 'Not configured', tone: 'neutral' },
  untested: { text: 'Not tested yet', tone: 'neutral' },
  stale: { text: 'Test out of date — settings changed since it passed', tone: 'warning' },
  ready: { text: 'Tested and working', tone: 'positive' },
  failed: { text: 'Last test failed', tone: 'warning' },
};

function formatTestedAt(timestamp: number | null): string {
  if (timestamp === null) {
    return '';
  }
  return new Date(timestamp).toLocaleString();
}

/**
 * The status of one configuration test.
 *
 * Shared by the text and TTS sections so both report a result the same way,
 * while remaining two separate instances: neither can ever show the other's
 * state.
 */
@Component({
  selector: 'mn-configuration-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status" role="status">
      <p class="headline" [class]="'tone-' + label().tone" [attr.data-readiness]="readiness()">
        {{ label().text }}
      </p>

      @if (testedAt(); as tested) {
        <p class="mn-hint">Last passed {{ tested }}.</p>
      }

      @if (failure(); as error) {
        <div class="failure">
          <p class="failure-heading">{{ copy(error).heading }}</p>
          <p>{{ copy(error).whatFailed }}</p>
          <p>{{ copy(error).whatDidNot }}</p>
          <p>{{ copy(error).primaryAction }}</p>
          <p class="mn-hint">{{ copy(error).escape }}</p>
          <p class="mn-hint">Code: {{ code(error) }}</p>
        </div>
      }
    </div>
  `,
  styles: `
    .status {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .headline {
      margin: 0;
      font-weight: 500;
    }

    .tone-positive {
      color: var(--status-success);
    }

    .tone-warning {
      color: var(--status-warning);
    }

    .failure {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .failure p {
      margin: 0;
    }

    .failure-heading {
      color: var(--status-danger);
      font-weight: 500;
    }
  `,
})
export class ConfigurationStatusComponent {
  readonly readiness = input.required<ConfigurationReadiness>();
  readonly lastTestedAt = input<number | null>(null);
  readonly failure = input<AiError | null>(null);

  protected readonly label = computed(() => LABELS[this.readiness()]);

  protected readonly testedAt = computed(() =>
    this.readiness() === 'ready' ? formatTestedAt(this.lastTestedAt()) : '',
  );

  protected copy = aiErrorCopy;
  protected code = technicalCode;
}
