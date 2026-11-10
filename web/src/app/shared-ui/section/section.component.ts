import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

let nextSectionId = 0;

/**
 * A titled section of a page: the heading on the canvas, an optional action
 * opposite it, and the content in one quiet raised card.
 *
 *   <mn-section heading="Storage" [rows]="true">
 *     <button mn-section-action mnButton="ghost" type="button">Export</button>
 *     <mn-row heading="Used">12 MB</mn-row>
 *     <mn-row heading="Delete everything">…</mn-row>
 *   </mn-section>
 *
 * A card of `rows` gives up its padding: each direct child spans the card and a
 * hairline separates it from the one before. Otherwise the content runs in one
 * stack inside the card's padding. A notice placed among rows keeps its own
 * border and sits inset from the card's edges.
 *
 * A section that needs a sentence of explanation before its card says it with
 * `mn-section-lead`: body text in the secondary colour, between the heading
 * and the card, one rhythm tighter than the gap that follows it.
 *
 * What answers the section as a whole, such as the result of an action in it,
 * goes after the card with `mn-section-footer`.
 *
 * The hairline reaches projected children, so these styles are global and
 * rooted at the element; no selector names a class from outside the section.
 */
@Component({
  selector: 'mn-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="mn-section__frame" [id]="sectionId()" [attr.aria-labelledby]="headingId">
      <header class="mn-section__header">
        <h2 [id]="headingId">{{ heading() }}</h2>
        <span class="mn-section__action mn-trailing"
          ><ng-content select="[mn-section-action]"
        /></span>
      </header>
      <div class="mn-section__lead"><ng-content select="[mn-section-lead]" /></div>
      <div class="mn-section__card" [class.mn-section__card--rows]="rows()">
        <ng-content />
      </div>
      <ng-content select="[mn-section-footer]" />
    </section>
  `,
  styles: `
    mn-section {
      display: block;
      min-width: 0;
    }

    mn-section > .mn-section__frame {
      display: flex;
      flex-direction: column;
      gap: var(--group-gap);
      min-width: 0;
    }

    mn-section > .mn-section__frame > .mn-section__header {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
      min-height: var(--heading-row);
    }

    mn-section > .mn-section__frame > .mn-section__header > h2 {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
    }

    mn-section > .mn-section__frame > .mn-section__header > .mn-section__action {
      display: flex;
      align-items: center;
      min-width: 0;
      margin-inline-start: auto;
      margin-block: calc((var(--heading-row) - var(--touch-target)) / 2);
    }

    mn-section > .mn-section__frame > .mn-section__header > .mn-section__action:empty {
      display: none;
    }

    mn-section > .mn-section__frame > .mn-section__lead {
      display: flex;
      flex-direction: column;
      gap: var(--group-gap);
      min-width: 0;
      padding-block-end: var(--group-gap);
      color: var(--text-secondary);
      line-height: var(--leading-normal);
    }

    mn-section > .mn-section__frame > .mn-section__lead:empty {
      display: none;
    }

    mn-section > .mn-section__frame > .mn-section__lead > :where(p) {
      margin: 0;
    }

    mn-section > .mn-section__frame > .mn-section__card {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      min-width: 0;
      padding: var(--surface-inset);
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      container-type: inline-size;
    }

    mn-section > .mn-section__frame > .mn-section__card--rows {
      gap: 0;
      padding: 0;
      overflow: clip;
    }

    /* The card draws the corners, so a row's hairline runs straight to its edges. */
    mn-section > .mn-section__frame > .mn-section__card--rows > :not(mn-notice) {
      border-radius: 0;
    }

    mn-section > .mn-section__frame > .mn-section__card--rows > * + *:not(mn-notice) {
      border-top: 1px solid var(--border-subtle);
    }

    mn-section > .mn-section__frame > .mn-section__card--rows > mn-notice {
      margin: var(--surface-inset);
    }

    mn-section > .mn-section__frame > .mn-section__card--rows > mn-notice + * {
      border-top: 0;
    }
  `,
})
export class SectionComponent {
  readonly heading = input.required<string>();
  /** The section's own anchor, for links into the page. */
  readonly sectionId = input<string | null>(null);
  /** The card is made of rows that bring their own padding. */
  readonly rows = input(false);
  protected readonly headingId = `mn-section-${String(nextSectionId++)}-heading`;
}
