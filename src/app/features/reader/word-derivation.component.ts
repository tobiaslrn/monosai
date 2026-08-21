import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { DerivationStep, WordDerivation } from '../../domain/reading/word-derivation';

/** One ladder row, with the explanation the reader can ask for folded in. */
interface DerivationRow {
  readonly step: DerivationStep;
  readonly detailEn: string | null;
}

/**
 * How a word was built, as a ladder from its dictionary form.
 *
 * Read-only and presentational: everything shown is computed in the domain from
 * the stored analysis and the shipped baseline, so this decides layout and
 * nothing else.
 *
 * Each row is a button rather than plain text for two reasons. It is the
 * keyboard's route to the explanation behind a step, which is otherwise folded
 * away so the default view stays three short lines instead of six stacked
 * paragraphs. And it is what tells the headword above which part of the word a
 * row is about, so ない and the なかっ it is written as are visibly the same
 * thing.
 */
@Component({
  selector: 'mn-word-derivation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (derivation(); as derivation) {
      <section class="derivation" aria-labelledby="mn-inspector-derivation">
        <h3 id="mn-inspector-derivation">How it is built</h3>

        @if (derivation.summaryEn.length > 0) {
          <p class="summary">{{ derivation.summaryEn.join(' · ') }}</p>
        }

        <ol>
          <li class="base">
            <span class="form" lang="ja">{{ derivation.baseSurface }}</span>
            <span class="effect">{{ derivation.baseLabel }}</span>
          </li>

          @for (row of rows(); track $index; let index = $index) {
            <li>
              <button
                type="button"
                class="step"
                [class.open]="expanded() === index"
                [attr.aria-expanded]="row.detailEn === null ? null : expanded() === index"
                [attr.aria-controls]="
                  row.detailEn === null ? null : 'mn-derivation-detail-' + index
                "
                (click)="toggle(index, row)"
                (pointerenter)="highlighted.emit(row.step.tokenIds)"
                (pointerleave)="highlighted.emit([])"
                (focus)="highlighted.emit(row.step.tokenIds)"
                (blur)="highlighted.emit([])"
              >
                <span class="joint" aria-hidden="true">+</span>
                <span class="form" lang="ja">{{ row.step.attached }}</span>
                <span class="effect">{{ row.step.effectEn }}</span>
                <span class="result" lang="ja">{{ row.step.resultingSurface }}</span>
              </button>

              @if (row.detailEn !== null && expanded() === index) {
                <p class="detail" [id]="'mn-derivation-detail-' + index">{{ row.detailEn }}</p>
              }
            </li>
          }
        </ol>
      </section>
    }
  `,
  styles: `
    .derivation h3 {
      margin: 0 0 var(--space-1);
      font-size: var(--text-md);
    }

    /*
     * The one line that answers "what form is this?", which is the question a
     * learner stopped on an inflected word to ask.
     */
    .summary {
      margin: 0 0 var(--space-2);
      color: var(--accent-secondary);
      font-size: var(--text-sm);
    }

    ol {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .base,
    .step {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      align-items: baseline;
      width: 100%;
      padding: var(--space-1) var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
    }

    /*
     * A press target rather than a line of text, so it takes the same target
     * size as every other control: opening a step's explanation on a phone is
     * an ordinary press and must not need aim.
     */
    .step {
      min-height: var(--touch-target);
      cursor: pointer;
    }

    .step:hover,
    .step.open {
      background: var(--surface-sunken);
    }

    .form {
      font-family: var(--font-japanese);
    }

    .effect {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /*
     * The running form is the payoff of the row, so it sits at the end of the
     * line and drops to its own line rather than crowding the ending it came
     * from when the popover is narrow.
     */
    .result {
      margin-inline-start: auto;
      color: var(--text-secondary);
      font-family: var(--font-japanese);
      font-size: var(--text-sm);
    }

    /* The step is what carries meaning; the joint only shows it is a stack. */
    .joint {
      width: 1em;
      color: var(--border-strong);
      font-size: var(--text-sm);
    }

    .base .form {
      font-size: var(--text-lg);
    }

    .detail {
      margin: 0 0 var(--space-1);
      padding-inline-start: calc(1em + var(--space-2) * 2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class WordDerivationComponent {
  readonly derivation = input<WordDerivation | null>(null);

  /** The tokens the pointer or keyboard is on, for the headword to tint. */
  readonly highlighted = output<readonly string[]>();

  private readonly expandedSignal = signal<number | null>(null);
  readonly expanded = this.expandedSignal.asReadonly();

  readonly rows = computed<readonly DerivationRow[]>(
    () =>
      this.derivation()?.steps.map((step) => ({
        step,
        detailEn: detailFor(step),
      })) ?? [],
  );

  /**
   * Opens one explanation at a time.
   *
   * Two open explanations push the rest of the ladder off a phone screen, which
   * is the layout this section exists to get away from.
   */
  toggle(index: number, row: DerivationRow): void {
    if (row.detailEn === null) {
      return;
    }
    this.expandedSignal.set(this.expandedSignal() === index ? null : index);
  }
}

/**
 * What a row has to say beyond its own line.
 *
 * The stem is worth naming only when it differs from the ending's dictionary
 * form: repeating that た is written た taught nobody anything.
 */
function detailFor(step: DerivationStep): string | null {
  const written = step.surface === step.attached ? null : `Written here as ${step.surface}.`;
  const parts = [step.detailEn, written].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' ');
}
