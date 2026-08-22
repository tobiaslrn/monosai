import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageStore } from '../../application/language/language.store';
import type { LanguageError } from '../../domain/language/language-error';
import { technicalCode } from '../../domain/shared/errors';

/**
 * Offline language assets: their state, active versions, and the licences under
 * which the bundled datasets are redistributed.
 *
 * Preparation starts on its own after startup, so this section reports progress
 * rather than asking for permission. Retrying is offered only when preparation
 * failed, which is the one case the user can act on.
 */
@Component({
  selector: 'mn-language-assets-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-language-assets-heading">
      <h2 id="mn-language-assets-heading">Language assets</h2>
      <p class="mn-hint">
        Japanese analysis, the bundled dictionary, the grammar presets, and the structural baseline
        are downloaded once and then verified and used offline.
      </p>

      <p data-testid="language-status" role="status">{{ statusText() }}</p>

      @if (store.status() === 'failed' && store.lastError(); as failure) {
        <p class="failure" data-testid="language-error">
          {{ failure.message }}
          <span class="code">{{ code(failure) }}</span>
        </p>
      }

      @if (versions(); as active) {
        <details class="details">
          <summary data-testid="language-versions-toggle">Show asset versions</summary>
          <dl data-testid="language-versions">
            <div>
              <dt>Tokenizer</dt>
              <dd>{{ active.tokenizerVersion }}</dd>
            </div>
            <div>
              <dt>Dictionary</dt>
              <dd>{{ active.dictionaryVersion }}</dd>
            </div>
            <div>
              <dt>Grammar presets</dt>
              <dd>{{ active.grammarPresetsVersion }}</dd>
            </div>
            <div>
              <dt>Structural baseline</dt>
              <dd>{{ active.structuralBaselineVersion }}</dd>
            </div>
          </dl>
        </details>
      }

      @if (store.status() === 'failed') {
        <button type="button" class="mn-button" data-testid="language-retry" (click)="retry()">
          Try again
        </button>
      }

      @if (store.attributions().length > 0) {
        <details class="details">
          <summary>Show data sources</summary>
          <ul data-testid="language-attributions">
            @for (attribution of store.attributions(); track attribution.name) {
              <li>
                <strong>{{ attribution.name }}</strong>
                <span>{{ attribution.noticeEn }}</span>
              </li>
            }
          </ul>
        </details>
      }
    </section>
  `,
  styles: `
    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
    }

    dl div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: space-between;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
    }

    .details {
      border-top: 1px solid var(--border-subtle);
    }

    summary {
      display: flex;
      align-items: center;
      min-height: var(--touch-target);
      color: var(--text-primary);
      font-weight: 500;
      cursor: pointer;
    }

    .details[open] summary {
      margin-bottom: var(--space-2);
    }

    .failure {
      color: var(--status-danger);
    }

    .code {
      color: var(--text-secondary);
      font-family: monospace;
      font-size: 0.875rem;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding-left: var(--space-4);
    }

    li {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    li strong {
      display: block;
      color: var(--text-primary);
    }
  `,
})
export class LanguageAssetsSectionComponent {
  protected readonly store = inject(LanguageStore);
  protected readonly versions = computed(() => this.store.versions());

  protected readonly statusText = computed(() => {
    const info = this.store.info();
    switch (this.store.status()) {
      case 'idle':
        return 'Waiting to prepare Japanese analysis.';
      case 'initializing':
        return 'Downloading and verifying language assets…';
      case 'failed':
        return 'Language assets are not ready.';
      case 'ready':
        return info === null
          ? 'Ready.'
          : `Ready: ${String(info.dictionaryEntryCount)} dictionary entries, ` +
              `${String(info.structuralBaselineEntries.length)} structural forms.`;
    }
  });

  protected code(failure: LanguageError): string {
    return technicalCode(failure);
  }

  protected retry(): void {
    void this.store.initialize();
  }
}
