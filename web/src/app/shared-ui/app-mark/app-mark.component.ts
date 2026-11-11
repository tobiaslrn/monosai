import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Monosai mark: the app icon at its one size, with the release stage over
 * its upper right while the application is in alpha. It leads the Library's
 * bar and the alpha notice, so the two read as the same thing.
 *
 *   <mn-app-mark [alpha]="true" />
 */
@Component({
  selector: 'mn-app-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img class="mark" src="icons/icon-192.png" alt="" width="32" height="30" />
    @if (alpha()) {
      <span class="alpha-marker" aria-label="Alpha version">α</span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      flex: none;
      margin-inline-end: var(--space-1);
      line-height: 0;
    }

    .mark {
      inline-size: var(--space-6);
      block-size: calc(var(--space-6) - calc(0.5 * var(--space-1)));
      border-radius: var(--radius-token);
      object-fit: cover;
      object-position: center top;
    }

    .alpha-marker {
      position: absolute;
      top: calc(-2.5 * var(--space-1));
      right: calc(-0.5 * var(--space-2));
      padding-inline: 1px;
      border-radius: var(--radius-control);
      background: var(--mark-ground);
      color: var(--status-danger);
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
      white-space: nowrap;
    }
  `,
})
export class AppMarkComponent {
  /** Shows the release stage over the mark. */
  readonly alpha = input(false);
}
