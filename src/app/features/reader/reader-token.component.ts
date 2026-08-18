import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isInspectable, presentStatus, rubyFor } from '../../domain/reading/token-presentation';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';

/**
 * One token in the reader.
 *
 * Inspectable tokens are real buttons, so keyboard activation, touch targets,
 * and assistive technology all work without custom key handling. Punctuation and
 * whitespace stay plain text rather than becoming focus stops that lead nowhere.
 */
@Component({
  selector: 'mn-reader-token',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (interactive()) {
      <button
        type="button"
        class="token"
        [class]="markerClass()"
        [class.is-selected]="selected()"
        (click)="activated.emit(token())"
        (focus)="previewed.emit(token())"
        (mouseenter)="previewed.emit(token())"
      >
        @if (ruby(); as reading) {
          <ruby
            >{{ token().surface }}<rt>{{ reading }}</rt></ruby
          >
        } @else {
          {{ token().surface }}
        }
        @if (statusLabel(); as label) {
          <span class="mn-visually-hidden">, {{ label }}</span>
        }
      </button>
    } @else {
      <span class="token is-plain">{{ token().surface }}</span>
    }
  `,
  styles: `
    :host {
      display: inline;
      /*
       * The reader header is sticky, so scrolling a token into view must stop
       * clear of it rather than tucking the word underneath.
       */
      scroll-margin-block-start: 5rem;
    }

    .token {
      display: inline;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: inherit;
      cursor: pointer;
    }

    .is-plain {
      cursor: text;
    }

    /*
     * Status is carried by an underline pattern as well as a colour, so the
     * meaning survives greyscale, colour-blindness, and forced-colours modes.
     */
    .is-known {
      text-decoration: underline dotted var(--status-success) 2px;
      text-underline-offset: 0.25em;
    }

    .is-normalized {
      text-decoration: underline dashed var(--status-success) 2px;
      text-underline-offset: 0.25em;
    }

    .is-structural {
      text-decoration: underline solid var(--border-strong) 1px;
      text-underline-offset: 0.25em;
    }

    .is-entity {
      text-decoration: underline dotted var(--accent-secondary) 2px;
      text-underline-offset: 0.25em;
    }

    .is-exception {
      text-decoration: underline double var(--accent-secondary) 3px;
      text-underline-offset: 0.2em;
    }

    .is-not-in-snapshot {
      text-decoration: underline dashed var(--status-warning) 2px;
      text-underline-offset: 0.25em;
    }

    .is-unknown {
      text-decoration: underline wavy var(--status-danger) 2px;
      text-underline-offset: 0.2em;
    }

    .token:hover,
    .token:focus-visible {
      background: var(--action-primary-soft);
      border-radius: 4px;
    }

    .token.is-selected {
      background: var(--accent-secondary-soft);
      border-radius: 4px;
    }

    rt {
      font-size: 0.5em;
      /* Ruby must not be dragged into the underline of its own token. */
      text-decoration: none;
    }
  `,
})
export class ReaderTokenComponent {
  readonly token = input.required<Token>();
  readonly status = input<TokenStatusAssignment | null>(null);
  readonly showFurigana = input(true);
  readonly showMarkers = input(true);
  readonly selected = input(false);

  readonly activated = output<Token>();
  readonly previewed = output<Token>();

  protected readonly interactive = computed(() => isInspectable(this.token()));

  protected readonly ruby = computed(() => (this.showFurigana() ? rubyFor(this.token()) : null));

  private readonly presentation = computed(() => {
    const status = this.status();
    return status === null ? null : presentStatus(status.validation);
  });

  protected readonly markerClass = computed(() => {
    const presentation = this.presentation();
    if (!this.showMarkers() || presentation === null || presentation.marker === 'punctuation') {
      return '';
    }
    return `is-${presentation.marker}`;
  });

  /** Only announced when markers are on, so the aid switch controls both. */
  protected readonly statusLabel = computed(() => {
    const presentation = this.presentation();
    if (!this.showMarkers() || presentation === null || presentation.marker === 'punctuation') {
      return null;
    }
    return presentation.label;
  });
}
