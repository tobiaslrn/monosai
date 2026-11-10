import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The head of a group of rows inside a card: its title, and its status and
 * actions at the inline end.
 *
 *   <mn-group-header heading="Text" headingId="mn-text-model-label">
 *     <span class="mn-status-pill">Ready</span>
 *   </mn-group-header>
 *
 * The group itself names `headingId` as its label.
 */
@Component({
  selector: 'mn-group-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mn-settings-group__header' },
  template: `
    <h3 class="mn-group-title" [id]="headingId()">{{ heading() }}</h3>
    <div class="status mn-actions mn-trailing"><ng-content /></div>
  `,
  styles: `
    .status {
      flex: 0 1 auto;
      justify-content: flex-end;
    }
    .status:empty {
      display: none;
    }
  `,
})
export class GroupHeaderComponent {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
}
