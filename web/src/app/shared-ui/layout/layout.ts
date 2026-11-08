import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The layout primitives. A feature places blocks with these and never writes
 * `margin`, `gap`, or `align-items` of its own: one page frame, one vertical
 * rhythm, one wrapping row, and one label-and-end row.
 *
 * Each styles only its own host, so whatever is projected into it keeps its own
 * look and only gains a place.
 */

/** A step on the spacing scale (`--space-1` to `--space-7`). */
export type Space = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const spaceToken = (step: Space): string => `var(--space-${String(step)})`;

/**
 * The frame of every non-reader screen: its `mn-page-header`, then the content,
 * in one centred column on the page measure.
 */
@Component({
  selector: 'mn-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
      max-width: var(--page-measure);
      margin-inline: auto;
    }
  `,
})
export class PageComponent {}

/** A vertical run of blocks with one gap between them. */
@Component({
  selector: 'mn-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.gap]': 'gapValue()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
  `,
})
export class StackComponent {
  readonly gap = input<Space>(3);
  protected readonly gapValue = computed(() => spaceToken(this.gap()));
}

export type ClusterJustify = 'start' | 'end' | 'between';

/**
 * A row of items that wraps as a whole: buttons acting together, chips, a
 * label with its badge. An item never shrinks below its own content, so a
 * button label is never broken across two lines.
 */
@Component({
  selector: 'mn-cluster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.gap]': 'gapValue()',
    '[class.cluster--end]': "justify() === 'end'",
    '[class.cluster--between]': "justify() === 'between'",
  },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
    }
    :host(.cluster--end) {
      justify-content: flex-end;
    }
    :host(.cluster--between) {
      justify-content: space-between;
    }
  `,
})
export class ClusterComponent {
  readonly gap = input<Space>(2);
  readonly justify = input<ClusterJustify>('start');
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
