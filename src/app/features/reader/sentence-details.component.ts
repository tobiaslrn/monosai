import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { SentenceAids } from '../../application/enrichment/sentence-aids.store';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/** Enough of a hash to compare two by eye, never enough to mistake for an id. */
function shortHash(hash: string): string {
  return hash === '' ? 'none' : hash.slice(0, 8);
}

/**
 * Where one sentence's aids came from.
 *
 * Provenance the learner can act on: which model and prompt produced what, when,
 * which grammar profile judged it, and what failed last. Provider text never
 * appears here — a failure is rendered through the shared copy table, so the
 * screen says what happened in Monosai's words rather than the provider's.
 */
@Component({
  selector: 'mn-sentence-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="details">
      <section aria-labelledby="mn-sentence-details-translation">
        <h3 id="mn-sentence-details-translation">Translation</h3>
        @if (aids().translation; as translation) {
          <dl>
            <div>
              <dt>Model</dt>
              <dd>{{ translation.modelId }}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{{ translation.promptVersion }}</dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd>{{ translation.createdAt | date: 'medium' }}</dd>
            </div>
          </dl>
        } @else {
          <p class="mn-hint">Not translated. Nothing has been requested for this sentence.</p>
        }
        @if (translationFailure(); as failure) {
          <p class="mn-error" role="alert">{{ failure }}</p>
        }
      </section>

      <section aria-labelledby="mn-sentence-details-grammar">
        <h3 id="mn-sentence-details-grammar">Grammar</h3>
        @if (aids().grammar; as grammar) {
          <dl>
            <div>
              <dt>Model</dt>
              <dd>{{ grammar.modelId }}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{{ grammar.promptVersion }}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>{{ profileHash() }}</dd>
            </div>
            <div>
              <dt>Analyzed</dt>
              <dd>{{ grammar.createdAt | date: 'medium' }}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>
                {{
                  aids().grammarStale
                    ? 'Analyzed under an earlier grammar profile'
                    : 'Current for your grammar profile'
                }}
              </dd>
            </div>
          </dl>
        } @else {
          <p class="mn-hint">Not analyzed. Nothing has been requested for this sentence.</p>
        }
        @if (grammarFailure(); as failure) {
          <p class="mn-error" role="alert">{{ failure }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    .details {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    h3 {
      margin: 0 0 var(--space-2);
      font-size: var(--text-md);
    }

    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-1) var(--space-3);
      margin: 0;
      font-size: var(--text-sm);
    }

    dl > div {
      display: contents;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .mn-error {
      margin: var(--space-2) 0 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }
  `,
})
export class SentenceDetailsComponent {
  readonly aids = input.required<SentenceAids>();

  protected readonly profileHash = computed(() =>
    shortHash(this.aids().grammar?.profileHash ?? ''),
  );

  protected readonly translationFailure = computed(() =>
    describeFailure(this.aids().translationAction.error),
  );

  protected readonly grammarFailure = computed(() =>
    describeFailure(this.aids().grammarAction.error),
  );
}

function describeFailure(failure: SentenceAids['translationAction']['error']): string | null {
  if (failure === null) {
    return null;
  }
  if (failure.source === 'storage') {
    return `Saving failed: ${failure.error.message} The sentence itself is unchanged.`;
  }
  const copy = aiErrorCopy(failure.error);
  return `${copy.heading} while ${aiTaskCopy(failure.error.task)}. ${copy.primaryAction}`;
}
