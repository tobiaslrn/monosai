import {
  ChangeDetectionStrategy,
  Component,
  input,
  linkedSignal,
  ViewEncapsulation,
} from '@angular/core';

/** Which way the learner last moved between steps. */
type StepDirection = 'forward' | 'back' | 'none';

/**
 * The body of the step a form in steps is on. Its content is recreated for each
 * step, and the new step arrives from the side it was travelled to: from the
 * end going forward, from the start going back. The first step shown simply
 * stands; the page already arrived.
 *
 *   <mn-wizard-step [step]="draft.step()">
 *     @switch (draft.step()) { … }
 *   </mn-wizard-step>
 *
 * Its blocks keep the page's rhythm, as if they sat in the page directly.
 * Styles reach projected content and are therefore global, rooted at the element.
 */
@Component({
  selector: 'mn-wizard-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { '[attr.data-direction]': 'direction()' },
  template: `<ng-content />`,
  styles: `
    @use '../../../styles/motion' as motion;

    mn-wizard-step {
      display: flex;
      flex-direction: column;
      gap: var(--page-gap);
      min-width: 0;
    }

    mn-wizard-step[data-direction='forward'] > * {
      @include motion.step(forward);
    }

    mn-wizard-step[data-direction='back'] > * {
      @include motion.step(back);
    }
  `,
})
export class WizardStepComponent {
  /** The step on screen, counted from one. */
  readonly step = input.required<number>();

  protected readonly direction = linkedSignal<number, StepDirection>({
    source: this.step,
    computation: (step, previous) => {
      if (previous === undefined || previous.source === step) {
        return previous?.value ?? 'none';
      }
      return step > previous.source ? 'forward' : 'back';
    },
  });
}
