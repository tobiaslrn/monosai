import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonDirective } from '../button/button';
import { IconComponent } from '../icon/icon.component';

/**
 * The header row of every overlay surface: an optional back arrow for a step
 * below the first, the title, and an optional close.
 *
 *   <mn-overlay-header heading="Anki" headingId="add-words-title"
 *                      backLabel="Back to the list of sources" closeLabel="Close"
 *                      (back)="…" (dismissed)="…" />
 *
 * The title is the overlay's accessible name. The close is the surface's way
 * out on a wide viewport; docked to a phone's edge the grab handle is, and the
 * owner passes no close label there.
 */
@Component({
  selector: 'mn-overlay-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  host: { class: 'mn-overlay__header' },
  template: `
    @if (backLabel(); as label) {
      <button
        type="button"
        mnButton="icon"
        class="back"
        [attr.aria-label]="label"
        [title]="label"
        (click)="back.emit()"
      >
        <mn-icon name="back" />
      </button>
    }
    <h2 class="mn-overlay__title" [id]="headingId()">{{ heading() }}</h2>
    @if (closeLabel(); as label) {
      <button
        type="button"
        mnButton="icon"
        class="close"
        data-overlay-close
        [attr.aria-label]="label"
        [title]="label"
        (click)="dismissed.emit()"
      >
        <mn-icon name="close" />
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
      gap: var(--inline-gap);
      align-items: center;
      min-width: 0;
      padding-inline: var(--overlay-inset);
    }

    h2 {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
    }

    /*
     * An icon button's glyph sits in a touch target larger than itself. The
     * target overhangs the row, so the glyph, not the target, lines up with
     * the surface's inset and the row stays the height of its title.
     */
    .back,
    .close {
      flex: none;
      margin-block: calc(-1 * var(--space-3));
    }

    .back {
      margin-inline-start: calc(-1 * var(--space-3));
    }

    .close {
      margin-inline-end: calc(-1 * var(--space-3));
    }
  `,
})
export class OverlayHeaderComponent {
  readonly heading = input.required<string>();
  readonly headingId = input<string | null>(null);
  /** Names the back arrow; without one, there is no back arrow. */
  readonly backLabel = input<string | null>(null);
  /** Names the close; without one, there is no close. */
  readonly closeLabel = input<string | null>(null);
  readonly back = output<void>();
  /** The close was pressed. */
  readonly dismissed = output<void>();
}
