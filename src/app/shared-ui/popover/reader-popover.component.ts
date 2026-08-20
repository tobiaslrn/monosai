import { A11yModule } from '@angular/cdk/a11y';
import type { AfterViewInit, ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';

/**
 * The card every floating reader surface is rendered in.
 *
 * One component for word details and the sentence menu alike: they differ in
 * content, not in how they behave. Focus moves to the card and is trapped while
 * it is open, which is what makes a floating surface usable with a keyboard or
 * a screen reader; `PopoverService` owns dismissal and returning focus.
 *
 * Below the desktop breakpoint the same card docks to the bottom edge as a
 * sheet, so a touch target stays reachable without a second implementation to
 * keep in step.
 */
@Component({
  selector: 'mn-reader-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  host: { '[class.is-sheet]': 'isSheet()' },
  template: `
    <div #card class="popover" role="dialog" tabindex="-1" [attr.aria-label]="label()" cdkTrapFocus>
      <ng-content />
    </div>
  `,
  styles: `
    .popover {
      box-sizing: border-box;
      width: min(23rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(28rem, calc(100dvh - 6rem));
      padding: var(--space-4);
      overflow-y: auto;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
      transition: opacity var(--motion-fast) ease-out;

      @starting-style {
        opacity: 0;
      }
    }

    :host(.is-sheet) .popover {
      width: 100vw;
      max-width: 100%;
      max-height: 85dvh;
      border-inline: 0;
      border-block-end: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .popover {
        transition: none;
      }
    }
  `,
})
export class ReaderPopoverComponent implements AfterViewInit {
  /** Names the dialog, because the card itself carries no visible heading. */
  readonly label = input.required<string>();

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly viewport = inject(ViewportService);

  protected readonly isSheet = this.viewport.isMobile;

  /**
   * Focus starts on the card rather than on its first control, so a screen
   * reader hears what opened before it hears the first thing inside it. The
   * focus trap then keeps focus here until the popover closes.
   */
  ngAfterViewInit(): void {
    this.card().nativeElement.focus();
  }
}
