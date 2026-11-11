import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextTextEndId = 0;

/**
 * What closes a text: a short rule, a heading, and the ways on, on the text's
 * own left edge with room above it so it reads as the end and not as another
 * paragraph. The projected actions are one row, the way on first.
 *
 *   <mn-text-end heading="The end">
 *     <mn-cluster fill="split">…</mn-cluster>
 *   </mn-text-end>
 */
@Component({
  selector: 'mn-text-end',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="end" [attr.aria-labelledby]="headingId">
      <span class="mark" aria-hidden="true"></span>
      <h2 class="title" [id]="headingId">{{ heading() }}</h2>
      <div class="actions"><ng-content /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding-block-start: var(--space-7);
    }

    .end {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      align-items: flex-start;
    }

    .actions {
      align-self: stretch;
      padding-block-start: var(--group-gap);
    }

    .mark {
      display: block;
      width: var(--space-6);
      border-block-start: 1px solid var(--border-strong);
    }

    .title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-snug);
    }
  `,
})
export class TextEndComponent {
  protected readonly headingId = `mn-text-end-${String(nextTextEndId++)}`;

  readonly heading = input.required<string>();
}
