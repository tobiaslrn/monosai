import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';

/**
 * The layout primitives. A feature places blocks with these and never writes
 * `margin`, `gap`, or `align-items` of its own: one page frame, one vertical
 * rhythm, one wrapping row, and one label-and-end row.
 *
 * Each styles only its own host, so whatever is projected into it keeps its own
 * look and only gains a place.
 */

/** A step on the spacing scale (`--space-1` to `--space-7`). */
/** A step of the spacing scale; 0 butts items together, such as rows between dividers. */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A step of the scale, or `page` for the gap between a page's own blocks. */
export type Gap = Space | 'page';

const spaceToken = (step: Gap): string =>
  step === 'page' ? 'var(--page-gap)' : step === 0 ? '0' : `var(--space-${String(step)})`;

/**
 * The frame of every non-reader screen: its `mn-page-header`, then the content,
 * in one centred column on the page measure.
 */
@Component({
  selector: 'mn-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.gap]': 'gapValue()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--page-gap);
      width: 100%;
      max-width: var(--page-measure);
      margin-inline: auto;
    }
  `,
})
export class PageComponent {
  /**
   * The rail between blocks. Omitted, it is the page gap every screen shares;
   * a step of the scale is for a screen that is one composition.
   */
  readonly gap = input<Space | null>(null);
  protected readonly gapValue = computed(() => {
    const step = this.gap();
    return step === null ? null : spaceToken(step);
  });
}

/** A vertical run of blocks with one gap between them. */
@Component({
  selector: 'mn-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.gap]': 'gapValue()', '[class.stack--start]': "align() === 'start'" },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      min-width: 0;
    }
    :host(.stack--start) {
      align-items: flex-start;
    }
  `,
})
export class StackComponent {
  /** Omitted, the stack gap every card shares; a step of the scale otherwise. */
  readonly gap = input<Gap | null>(null);
  /** `start` keeps each block at its own width, such as a lone button. */
  readonly align = input<'stretch' | 'start'>('stretch');
  protected readonly gapValue = computed(() => {
    const step = this.gap();
    return step === null ? null : spaceToken(step);
  });
}

export type ClusterJustify = 'start' | 'end' | 'between';

/**
 * A row of items that wraps as a whole: buttons acting together, chips, a
 * label with its badge. An item never shrinks below its own content, so a
 * button label is never broken across two lines.
 *
 * `fill="narrow"` shares the row equally between the items on a screen
 * narrower than the wide layout, such as a set of filters a thumb has to hit.
 * `fill="first"` gives the first item what the rest leave, on one line: a
 * text field and the button that submits it.
 * That reaches the projected items, so the styles are global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-cluster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.gap]': 'gapValue()',
    '[class.cluster--end]': "justify() === 'end'",
    '[class.cluster--between]': "justify() === 'between'",
    '[class.cluster--fill-narrow]': "fill() === 'narrow'",
    '[class.cluster--fill-first]': "fill() === 'first'",
  },
  template: `<ng-content />`,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    mn-cluster {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
    }
    mn-cluster.cluster--end {
      justify-content: flex-end;
    }
    mn-cluster.cluster--between {
      justify-content: space-between;
    }
    mn-cluster.cluster--fill-first {
      flex-wrap: nowrap;
    }
    mn-cluster.cluster--fill-first > :first-child {
      flex: 1;
      min-width: 0;
    }
    @media (max-width: breakpoints.$wide-max) {
      /* Equal columns, so every item is the same width whatever its label. */
      mn-cluster.cluster--fill-narrow {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr));
      }
    }
  `,
})
export class ClusterComponent {
  readonly gap = input<Space>(2);
  readonly justify = input<ClusterJustify>('start');
  readonly fill = input<'none' | 'narrow' | 'first'>('none');
  protected readonly gapValue = computed(() => spaceToken(this.gap()));
}

/**
 * Equal columns that fit as many as the width allows, each at least `min`
 * wide, and one column when not even two fit: a set of fields answering
 * related questions, side by side once a stack of full-width controls would
 * be a column of bars.
 */
@Component({
  selector: 'mn-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.gap]': 'gapValue()', '[style.--mn-grid-min]': 'min()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--mn-grid-min)), 1fr));
      min-width: 0;
    }
  `,
})
export class GridComponent {
  /** The narrowest a column may be, in rem so it grows with the text. */
  readonly min = input<'9rem' | '12rem'>('12rem');
  readonly gap = input<Space>(3);
  protected readonly gapValue = computed(() => spaceToken(this.gap()));
}

/**
 * A label block and an end block on one line, the end pinned to the inline
 * end and aligned with the label's first line. When the split's own width no
 * longer holds both, the end block moves below the label as a whole.
 *
 *   <mn-split>
 *     <span>Label and its detail</span>
 *     <button mn-split-end mnButton>Action</button>
 *   </mn-split>
 */
@Component({
  selector: 'mn-split',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="split">
      <div class="start"><ng-content /></div>
      <div class="end"><ng-content select="[mn-split-end]" /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }
    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2) var(--space-3);
      align-items: center;
    }
    .start {
      min-width: 0;
    }
    .end {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
    }
    .end:empty {
      display: none;
    }
    @container (max-width: 24rem) {
      .split {
        grid-template-columns: minmax(0, 1fr);
      }
      .end {
        justify-content: flex-start;
      }
    }
  `,
})
export class SplitComponent {}
