import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** For durable tests: put on the value. */
  readonly testId?: string;
}

/**
 * A read-only list of facts: each label on the left, its value on the right,
 * on one line at every width. The look is the shared `.mn-facts` role.
 */
@Component({
  selector: 'mn-facts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="mn-facts" [attr.aria-label]="label()">
      @for (fact of facts(); track fact.label) {
        <div>
          <dt>{{ fact.label }}</dt>
          <dd [attr.data-testid]="fact.testId ?? null">{{ fact.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class FactsComponent {
  readonly facts = input.required<readonly Fact[]>();
  readonly label = input<string | null>(null);
}
