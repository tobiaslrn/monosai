import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { NavigationExtras, Params } from '@angular/router';
import { RouterLink } from '@angular/router';

/** Where a fact's label leads: the screen that changes it. */
export interface FactLink {
  readonly route: string;
  readonly fragment?: string;
  readonly queryParams?: Params;
  readonly state?: NavigationExtras['state'];
}

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** For durable tests: put on the value. */
  readonly testId?: string;
  readonly link?: FactLink;
}

/**
 * A read-only list of facts as a compact definition list: the labels in one
 * column sized to the longest, each value left-aligned beside its label, and
 * label above value where the list itself is narrow. The look is the shared
 * `.mn-facts` role.
 */
@Component({
  selector: 'mn-facts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <dl class="mn-facts" [attr.aria-label]="label()">
      @for (fact of facts(); track fact.label) {
        <div>
          <dt>
            @if (fact.link; as link) {
              <a
                [routerLink]="link.route"
                [fragment]="link.fragment"
                [queryParams]="link.queryParams"
                [state]="link.state"
                >{{ fact.label }}</a
              >
            } @else {
              {{ fact.label }}
            }
          </dt>
          <dd [attr.data-testid]="fact.testId ?? null">{{ fact.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      container: mn-facts / inline-size;
    }
  `,
})
export class FactsComponent {
  readonly facts = input.required<readonly Fact[]>();
  readonly label = input<string | null>(null);
}
