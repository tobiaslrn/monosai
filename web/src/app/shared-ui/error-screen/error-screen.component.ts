import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Shared failure presentation: what failed, what did not fail, whether data was
 * saved, and the caller's recovery actions projected into the actions slot.
 */
@Component({
  selector: 'mn-error-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="panel" role="alert">
      <p class="badge"><mn-icon name="warning" [size]="18" /> {{ heading() }}</p>
      <p class="description">{{ description() }}</p>
      @if (dataStatus(); as status) {
        <p class="data-status">{{ status }}</p>
      }
      <div class="actions">
        <ng-content select="[data-actions]" />
      </div>
      @if (code(); as technical) {
        <p class="code">
          Technical code: <code>{{ technical }}</code>
        </p>
      }
    </section>
  `,
  styleUrl: './error-screen.component.scss',
})
export class ErrorScreenComponent {
  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  /** Explicit statement about saved data, required by the failure policy. */
  readonly dataStatus = input<string | null>(null);
  readonly code = input<string | null>(null);
}
