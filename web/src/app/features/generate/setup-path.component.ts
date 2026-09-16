import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import type {
  GrammarPresetLine,
  PrerequisiteCheck,
} from '../../application/generation/generation-prerequisites';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * Everything a story needs, in the order it is done, on the screen that needs it.
 *
 * It stands in for the form until it is complete. Before this, a learner who
 * had never written anything arrived at an editable form with two warnings
 * above it, filled the form in, and only then found the Generate button dead —
 * the screen had all the state it needed to sequence the work and used it only
 * to disable a button.
 *
 * Unlike the panel that rides above a working form, this shows every row and
 * its current state, the satisfied ones included: the reading level is already
 * set for everyone, and seeing one step done is the difference between a list
 * of complaints and a path. Every row leads to the screen that settles it, and
 * the draft survives the trip because it lives in a root-provided store.
 */
@Component({
  selector: 'mn-setup-path',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <!-- Named by the page's own bar: two headings saying the same four words. -->
    <section class="setup mn-card mn-stack" aria-labelledby="mn-page-title">
      <p class="mn-hint">Each of these opens the screen that settles it, and brings you back.</p>

      <ol class="steps">
        @for (check of checks(); track check.id) {
          <li class="step" [attr.data-check]="check.id" [class.is-done]="check.satisfied">
            <!--
              The tick is decoration, as every icon here is. The state a screen
              reader needs is a word in the sentence.
            -->
            <mn-icon class="mark" [name]="check.satisfied ? 'check' : 'warning'" [size]="18" />
            <p class="detail">
              <span class="mn-visually-hidden">{{ check.satisfied ? 'Done. ' : 'To do. ' }}</span>
              <strong>{{ check.label }}: </strong>{{ check.detail }}
            </p>
            @if (check.route !== '') {
              <!--
                One primary action at a time: the next thing to do. Two filled
                buttons on one list is two next things, which is no sequence.
              -->
              <a
                class="mn-button"
                [class.mn-button--primary]="check.id === nextStep()"
                [routerLink]="check.route"
                [queryParams]="{ from: 'generate' }"
                [state]="generateOriginState"
              >
                {{ check.actionLabel }}
              </a>
            }
          </li>
        }
      </ol>

      @if (preset().warning; as warning) {
        <p class="mn-notice mn-notice--info" data-testid="preset-warning">
          <mn-icon name="info" [size]="16" />
          <span><span class="mn-visually-hidden">Note: </span>{{ warning }}</span>
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .setup > .mn-hint {
      margin: 0;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: none;
    }

    /*
     * Every row has the same shape: its state, the sentence, and the way to
     * settle it under the sentence. Wrapping by width put one button beside its
     * text and the next one below, which read as two different kinds of row.
     */
    .step {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-2) var(--space-3);
      align-items: start;
    }

    .mark {
      margin-top: 0.125rem;
      color: var(--status-warning);
    }

    .step.is-done .mark {
      color: var(--status-success);
    }

    .step .mn-button {
      grid-column: 2;
      justify-self: start;
    }

    .detail {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .step.is-done .detail strong {
      color: var(--text-secondary);
    }
  `,
})
export class SetupPathComponent {
  protected readonly generateOriginState = navigationOriginState('/generate');
  readonly checks = input.required<readonly PrerequisiteCheck[]>();
  readonly preset = input.required<GrammarPresetLine>();

  /** The one row whose action is offered as the next thing to do. */
  protected readonly nextStep = computed(
    () => this.checks().find((check) => !check.satisfied && check.route !== '')?.id ?? null,
  );
}
