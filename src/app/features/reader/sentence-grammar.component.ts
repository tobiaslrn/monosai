import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FindingConfidence, GrammarFinding } from '../../domain/enrichment/records';

/**
 * Worded confidence bands.
 *
 * Never a percentage: the model reports a band, and printing "72%" would claim
 * a precision that does not exist (`domain-and-data-model.md:251`).
 */
const CONFIDENCE_LABELS: Record<FindingConfidence, string> = {
  low: 'Tentative',
  medium: 'Fairly sure',
  high: 'Confident',
};

/**
 * The grammar findings for one sentence, under the sentence they describe.
 *
 * Advisory throughout: a finding explains something about the Japanese, it
 * never claims the sentence is wrong. Findings already in the learner's profile
 * are shown too, but only out-of-profile ones are marked as concerns.
 */
@Component({
  selector: 'mn-sentence-grammar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="grammar" lang="en">
      @if (stale()) {
        <span class="stale">
          Analyzed under an earlier grammar profile. Re-analyze from the sentence menu for findings
          judged against the current one.
        </span>
      }
      @for (finding of findings(); track $index) {
        <span class="finding" [class.is-concern]="!finding.inProfile">
          <span class="label">{{ finding.label }}</span>
          <span class="band">{{ confidenceLabel(finding.confidence) }}</span>
          @if (!finding.inProfile) {
            <span class="concern">Outside your grammar profile</span>
          }
          <span class="explanation">{{ finding.explanationEn }}</span>
        </span>
      } @empty {
        <span class="finding">
          <span class="explanation">Nothing outside your grammar profile was found here.</span>
        </span>
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
    }

    .grammar {
      display: block;
      margin: var(--space-1) 0 var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-inline-start: 2px solid var(--border-subtle);
      border-radius: 0 var(--radius-control) var(--radius-control) 0;
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      line-height: 1.6;
    }

    .stale {
      display: block;
      margin-bottom: var(--space-2);
      color: var(--status-warning);
    }

    .finding {
      display: block;
    }

    .finding + .finding {
      margin-top: var(--space-2);
    }

    .label {
      font-weight: 600;
    }

    /*
     * A concern is named in words as well as tinted, so the distinction is not
     * carried by colour alone.
     */
    .band,
    .concern {
      display: inline-block;
      margin-inline-start: var(--space-2);
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
      font-size: var(--text-sm);
    }

    .is-concern .concern {
      background: var(--status-warning-soft);
      color: var(--status-warning);
    }

    .explanation {
      display: block;
    }
  `,
})
export class SentenceGrammarComponent {
  readonly findings = input.required<readonly GrammarFinding[]>();
  readonly stale = input(false);

  protected confidenceLabel(confidence: FindingConfidence): string {
    return CONFIDENCE_LABELS[confidence];
  }
}
