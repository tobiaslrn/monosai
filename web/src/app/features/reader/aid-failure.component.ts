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
      <div class="mn-notice mn-notice--error" role="alert">
        <div>
          <p>{{ message }}</p>
          <p>Your reading and saved aids are unchanged.</p>
        </div>
        @if (setupMessage() || needsSettings()) {
          <a class="mn-button" routerLink="/settings">Open Settings</a>
        } @else if (needsCredit()) {
          <a
            class="mn-button"
            href="https://openrouter.ai/settings/credits"
            target="_blank"
            rel="noopener noreferrer"
            >OpenRouter credit</a
          >
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      align-self: stretch;
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
