import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Where a learner is in a short form split into steps: each step numbered
 * under a bar, the finished ones ticked, the current one marked. It only
 * shows the place; the form's own buttons move between steps.
 *
 *   <mn-wizard-steps label="Steps" [steps]="['Words', 'Direction', 'Plot']" [current]="2" />
 *
 * The steps share the width and wrap to fewer columns when the labels need
 * the room. A long task's progress through its stages is `mn-stepper`.
 */
@Component({
  selector: 'mn-wizard-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <ol [attr.aria-label]="label()">
      @for (name of steps(); track name; let index = $index) {
        <li
          [class.is-done]="current() > index + 1"
          [class.is-current]="current() === index + 1"
          [attr.aria-current]="current() === index + 1 ? 'step' : null"
        >
          <span class="mark" aria-hidden="true">
            @if (current() > index + 1) {
              <mn-icon name="check" [size]="14" />
            } @else {
              {{ index + 1 }}
            }
          </span>
          <span>{{ name }}</span>
          @if (current() > index + 1) {
            <span class="mn-visually-hidden">, done</span>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    :host {
      display: block;
      min-width: 0;
    }

    ol {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 5.5rem), 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /*
     * Each step's rail is a track with a fill drawn over it, uncovered from the
     * start as the learner reaches the step and covered again if they go back,
     * so moving between steps reads as progress rather than a recolour.
     */
    li {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      align-items: center;
      min-width: 0;
      padding-top: calc(var(--space-2) + 3px);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
      @include motion.state(color);
    }

    li::before,
    li::after {
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      border-radius: var(--radius-pill);
      content: '';
    }

    li::before {
      background: var(--border-subtle);
    }

    li::after {
      background: var(--action-primary);
      clip-path: inset(0 100% 0 0);
      @include motion.fill;
    }

    li.is-done::after,
    li.is-current::after {
      clip-path: inset(0);
    }

    li.is-done {
      color: var(--text-primary);
    }

    li.is-current {
      color: var(--action-primary-text);
    }

    .mark {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
    }

    .mark {
      @include motion.state(background-color, border-color, color);
    }

    .is-done .mark {
      border-color: var(--action-primary);
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    .is-current .mark {
      border-color: var(--action-primary);
    }
  `,
})
export class WizardStepsComponent {
  readonly label = input.required<string>();
  readonly steps = input.required<readonly string[]>();
  /** The step the learner is on, counting from 1. */
  readonly current = input.required<number>();
}
