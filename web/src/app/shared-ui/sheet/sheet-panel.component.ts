import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { SheetHandleComponent } from './sheet-handle.component';

/**
 * The surface of a form opened in a CDK dialog that docks to a phone's bottom
 * edge: a centred card on a wide screen, and on a phone a sheet with a grab
 * handle that can be dragged down to dismiss it.
 *
 *   <mn-sheet-panel heading="Filters" headingId="filters-title" [leaving]="leaving()"
 *                   handleLabel="Close filters" (dismissed)="depart()" (departed)="finish()">
 *     <label class="mn-field">…</label>
 *     <button mn-sheet-action mnButton="primary" type="button">Show</button>
 *   </mn-sheet-panel>
 *
 * Its body is one stack; a `fieldset` in it groups controls without a frame.
 * The actions sit at its foot, spread to the two ends.
 *
 * The dialog removes its element the moment it closes, so dismissing is in
 * two steps: `leaving` slides the docked sheet back down its edge, and
 * `departed` says a slide has ended, so the owner, which knows it is leaving,
 * may close the dialog.
 *
 * Styles reach projected content and are therefore global, rooted at the
 * element.
 */
@Component({
  selector: 'mn-sheet-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [SheetHandleComponent],
  template: `
    <section
      class="mn-sheet-panel"
      [attr.aria-labelledby]="headingId()"
      [class.is-dragging]="dragOffset() > 0 && !leaving()"
      [class.is-leaving]="leaving()"
      [style.transform]="leaving() ? null : dragTransform()"
      (transitionend)="onTransitionEnd($event)"
    >
      @if (isMobile()) {
        <mn-sheet-handle #handle [label]="handleLabel()" (dismissed)="dismissed.emit()" />
      }
      <h2 class="mn-sheet-panel__title" [id]="headingId()">{{ heading() }}</h2>
      <ng-content />
      <div class="mn-sheet-panel__actions"><ng-content select="[mn-sheet-action]" /></div>
    </section>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    mn-sheet-panel {
      display: block;
    }

    mn-sheet-panel .mn-sheet-panel {
      display: grid;
      gap: var(--space-4);
      width: min(32rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(90vh, 42rem);
      overflow: auto;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
      transition: transform var(--motion-medium) var(--ease-settle);
    }

    mn-sheet-panel .mn-sheet-panel__title {
      margin: 0;
      font-size: var(--text-lg);
    }

    mn-sheet-panel fieldset {
      display: grid;
      gap: var(--space-3);
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    mn-sheet-panel legend {
      padding: 0;
      margin-block-end: var(--space-2);
      font-weight: var(--weight-medium);
    }

    mn-sheet-panel .mn-sheet-panel__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
      margin-block-start: var(--space-2);
    }

    mn-sheet-panel .mn-sheet-panel.is-dragging {
      transition: none;
    }

    /* Leaving, a docked sheet slides back down its edge, at the popover
       sheets' pace and curve, and is no longer a surface to press. */
    mn-sheet-panel .mn-sheet-panel.is-leaving {
      pointer-events: none;
    }

    mn-sheet-panel mn-sheet-handle {
      --mn-sheet-handle-bleed: var(--space-5);
    }

    @media (max-width: breakpoints.$wide-max) {
      mn-sheet-panel .mn-sheet-panel {
        width: 100%;
        max-height: 90vh;
        /* The grab handle sits flush against the docked edge. */
        padding-block-start: 0;
        border-inline: 0;
        border-block-end: 0;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      }

      /* Leaving accelerates, as a native sheet does; springing back keeps the settle curve. */
      mn-sheet-panel .mn-sheet-panel.is-leaving {
        transform: translateY(100%);
        transition: transform var(--motion-medium) var(--ease-exit);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      mn-sheet-panel .mn-sheet-panel,
      mn-sheet-panel .mn-sheet-panel.is-leaving {
        transition: none;
      }
    }
  `,
})
export class SheetPanelComponent {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly handleLabel = input('Close');
  /** Set once a dismissal has begun: the docked sheet slides away. */
  readonly leaving = input(false);
  /** The grab handle was dragged down or pressed. */
  readonly dismissed = output<void>();
  /**
   * A slide of the panel has ended. While its owner is dismissing it, that is
   * the slide away, and the dialog may close.
   */
  readonly departed = output<void>();

  protected readonly isMobile = inject(ViewportService).isMobile;
  private readonly handle = viewChild<SheetHandleComponent>('handle');
  protected readonly dragOffset = computed(() => this.handle()?.offset() ?? 0);
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });

  protected onTransitionEnd(event: TransitionEvent): void {
    if (event.target === event.currentTarget && event.propertyName === 'transform') {
      this.departed.emit();
    }
  }
}
