import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * A failure that replaces the page: the shared whole-page state
 * (`_state.scss`) in its danger tone. The title names what failed, the
 * description says what happened, the data status says what is unaffected,
 * and the projected actions — primary first — say what to do.
 *
 *   <mn-error-screen heading="Monosai could not start" description="…" dataStatus="…">
 *     <ng-container data-actions>…</ng-container>
 *   </mn-error-screen>
 */
@Component({
  selector: 'mn-error-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="mn-state mn-state--error" role="alert">
      <span class="mn-state__mark" aria-hidden="true"><mn-icon name="warning" [size]="20" /></span>
      <h2 class="mn-state__title">{{ heading() }}</h2>
      <p class="mn-state__what">{{ description() }}</p>
      @if (dataStatus(); as status) {
        <p class="mn-state__next">{{ status }}</p>
      }
      <div class="mn-state__actions">
        <ng-content select="[data-actions]" />
      </div>
    </section>
  `,
})
export class ErrorScreenComponent {
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly dataStatus = input<string | null>(null);
}
