import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

let nextSectionId = 0;

/**
 * A titled group of a page: a group label on the canvas, then its content in
 * one quiet raised card, then — where the group has something to say about
 * itself — one status line under the card.
 *
 *   <mn-section heading="Storage" [rows]="true">
 *     <mn-settings-row label="Space used" value="12 MB" />
 *     <mn-settings-row label="Delete saved audio" action="danger" … />
 *     <mn-status-line mn-section-footer tone="success">Ready.</mn-status-line>
 *   </mn-section>
 *
 * The label is the one group label (`mn-group-title`), inset to the text edge
 * of the rows. A group with no label of its own names itself with `label`. A
 * card of `rows` gives up its padding: each direct child spans the card and a
 * hairline, from the text edge to the card's end, separates it from the one
 * before. Otherwise the content runs in one stack inside the card's padding.
 *
 * What answers the group as a whole — where it stands, and its fix — goes after
 * the card with `mn-section-footer`.
 *
 * The hairline reaches projected children, so these styles are global and
 * rooted at the element; no selector names a class from outside the section.
 */
@Component({
  selector: 'mn-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <section
      class="mn-section__frame"
      [id]="sectionId()"
      [attr.aria-labelledby]="heading() === null ? null : headingId"
      [attr.aria-label]="heading() === null ? label() : null"
    >
      @if (heading(); as text) {
        <h2 class="mn-group-title mn-section__heading" [id]="headingId">{{ text }}</h2>
      }
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

    mn-section > .mn-section__frame > .mn-section__heading {
      padding-inline: var(--surface-inset);
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

    /* The card draws the corners, so a row's state layer runs straight to its edges. */
    mn-section > .mn-section__frame > .mn-section__card--rows > * {
      position: relative;
      border-radius: 0;
    }

    /* The hairline: from the text edge to the card's end. */
    mn-section > .mn-section__frame > .mn-section__card--rows > * + *::before {
      position: absolute;
      inset-block-start: 0;
      inset-inline: var(--surface-inset) 0;
      z-index: 1;
      border-top: 1px solid var(--border-subtle);
      content: '';
      pointer-events: none;
    }
  `,
})
export class SectionComponent {
  /** The group label; a group with none names itself with `label`. */
  readonly heading = input<string | null>(null);
  /** The accessible name of a group with no visible label. */
  readonly label = input<string | null>(null);
  /** The group's own anchor, for links into the page. */
  readonly sectionId = input<string | null>(null);
  /** The card is made of rows that bring their own padding. */
  readonly rows = input(false);
  protected readonly headingId = `mn-section-${String(nextSectionId++)}-heading`;
}
