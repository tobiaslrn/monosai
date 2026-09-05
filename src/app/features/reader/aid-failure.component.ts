import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EnrichmentFailure } from '../../application/enrichment/sentence-enrichment.service';
import { describeEnrichmentFailure, enrichmentNeedsSettings } from './enrichment-failure-copy';

/** The same recovery and preservation message for every sentence aid. */
@Component({
  selector: 'mn-aid-failure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (message(); as message) {
      <div class="failure" role="alert">
        <p>{{ message }}</p>
        <p class="unaffected">Your reading and saved aids are unchanged.</p>
        @if (setupMessage() || needsSettings()) {
          <a class="mn-button mn-button--secondary" routerLink="/settings">Open Settings</a>
        } @else if (needsCredit()) {
          <a
            class="mn-button mn-button--secondary"
            href="https://openrouter.ai/settings/credits"
            target="_blank"
            rel="noopener noreferrer"
            >OpenRouter credit (new tab)</a
          >
        }
      </div>
    }
  `,
  styles: `
    .failure {
      display: grid;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }
    p {
      margin: 0;
      color: var(--status-danger);
    }
    .unaffected {
      color: var(--text-secondary);
    }
    a {
      justify-self: start;
    }
  `,
})
export class AidFailureComponent {
  readonly failure = input<EnrichmentFailure | null>(null);
  readonly setupMessage = input<string | null>(null);
  protected readonly message = computed(
    () => this.setupMessage() ?? describeEnrichmentFailure(this.failure()),
  );
  protected readonly needsSettings = computed(() => enrichmentNeedsSettings(this.failure()));
  protected readonly needsCredit = computed(() => {
    const failure = this.failure();
    return failure?.source === 'provider' && failure.error.code === 'credit-exhausted';
  });
}
