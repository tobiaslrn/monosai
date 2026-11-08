import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * The one action of a long form, held at the bottom of the screen while the
 * form scrolls under it, with any line about that action beneath it.
 *
 *   <mn-action-bar>
 *     <button mnButton="primary" type="button">Next</button>
 *     <p class="mn-hint">Generation limit reached.</p>
 *   </mn-action-bar>
 *
 * It stays in the document flow, so what it says never covers the fields it
 * is about, and a button in it takes the full width. Styles reach the
 * projected button and are therefore global, rooted at the element.
 */
@Component({
  selector: 'mn-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  styles: `
    mn-action-bar {
      position: sticky;
      z-index: 2;
      bottom: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: 100%;
      margin-top: calc(var(--space-2) * -1);
      padding: var(--space-4) 0 calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
      background: var(--surface-canvas-fade);
    }

    mn-action-bar > :where(p) {
      margin: 0;
    }

    mn-action-bar > .mn-button {
      width: 100%;
    }
  `,
})
export class ActionBarComponent {}
