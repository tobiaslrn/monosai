import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isInspectable, presentStatus, rubyFor } from '../../domain/reading/token-presentation';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';

/**
 * A token and the element it was activated from.
 *
 * The element travels with the event because word details are anchored to the
 * word they describe, and because focus has to come back to it on dismissal.
 */
export interface TokenActivationSource {
  readonly token: Token;
  readonly origin: HTMLElement;
}

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
  imports: [NgTemplateOutlet],
  host: { '[class.has-grammar-concern]': 'grammarConcern()' },
  template: `
    @if (interactive()) {
      <!--
        The button is the ruby base rather than the ruby's parent, so a word's
        hit box is the word itself. The annotation above it stays part of the
        sentence, which is what lets a press over the furigana — or anywhere
        else in the line that is not a word — open the sentence instead.
      -->
      @if (ruby(); as reading) {
        <ruby
          ><ng-container *ngTemplateOutlet="tokenButton" /><rt>{{ reading }}</rt></ruby
        >
      } @else {
        <ng-container *ngTemplateOutlet="tokenButton" />
      }
    } @else {
      <span class="token is-plain">{{ token().surface }}</span>
    }

    <ng-template #tokenButton>
      <button
        type="button"
        class="token"
        [class]="markerClass()"
        [class.is-selected]="selected()"
        (click)="onActivate($event)"
        (focus)="onPreview($event)"
        (mouseenter)="onPreview($event)"
        (blur)="previewEnded.emit()"
        (mouseleave)="previewEnded.emit()"
      >
        {{ token().surface }}
        @if (statusLabel(); as label) {
          <span class="mn-visually-hidden">, {{ label }}</span>
        }
        @if (grammarConcern()) {
          <span class="mn-visually-hidden">, unfamiliar grammar</span>
        }
      </button>
    </ng-template>
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

    /*
     * A ruby base is blockified to inline-block, which would take the whole
     * loose line box with it and make the word's target as tall as the line.
     * Its own leading is reset so the box hugs the glyphs, leaving the space
     * above and below the word to the sentence.
     */
    .token {
      display: inline;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      /* After the font shorthand, which would otherwise reset the leading. */
      line-height: 1.15;
      text-align: inherit;
      cursor: pointer;
    }

    .is-plain {
      cursor: text;
    }

    /*
     * The reader marks warnings and nothing else. Both are squiggles rather
     * than a colour alone, so the two survive greyscale, colour-blindness, and
     * forced-colours modes, and both are paired with a hidden label.
     */
    .is-warning-vocabulary {
      text-decoration: underline wavy var(--marker-vocabulary) 1.5px;
      text-underline-offset: 0.2em;
    }

    .token:hover,
    .token:focus-visible {
      background: var(--action-primary-soft);
      border-radius: 4px;
    }

    /*
     * The grammar squiggle is drawn on the host rather than on the token, so a
     * word that is both unreviewed and part of an unfamiliar pattern carries
     * both lines instead of one overwriting the other. The deeper offset keeps
     * them apart.
     */
    :host(.has-grammar-concern) {
      text-decoration: underline wavy var(--marker-grammar) 1.5px;
      text-underline-offset: 0.36em;
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

    /*
     * The annotation is not part of the word's target: a press on it is a press
     * on the line, and belongs to the sentence.
     */
    rt {
      cursor: text;
    }
  `,
})
export class ReaderTokenComponent {
  readonly token = input.required<Token>();
  readonly status = input<TokenStatusAssignment | null>(null);
  readonly showFurigana = input(true);
  readonly showMarkers = input(true);
  readonly selected = input(false);
  /** Set only when a finding supplies a span that covers this token. */
  readonly grammarConcern = input(false);

  readonly activated = output<TokenActivationSource>();
  readonly previewed = output<TokenActivationSource>();
  readonly previewEnded = output<void>();

  protected readonly interactive = computed(() => isInspectable(this.token()));

  protected onActivate(event: MouseEvent): void {
    // The sentence around this token opens its menu on any click that reaches
    // it, so a word click must stop here or it would open both.
    event.stopPropagation();
    this.activated.emit({ token: this.token(), origin: event.currentTarget as HTMLElement });
  }

  protected onPreview(event: Event): void {
    this.previewed.emit({ token: this.token(), origin: event.currentTarget as HTMLElement });
  }

  protected readonly ruby = computed(() => (this.showFurigana() ? rubyFor(this.token()) : null));

  private readonly presentation = computed(() => {
    const status = this.status();
    return status === null ? null : presentStatus(status.validation);
  });

  /**
   * Nothing is marked unless it is a warning: a known word, a particle, and a
   * number all read as plain text, and everything their status has to say is
   * still in word details.
   */
  protected readonly marked = computed(
    () => this.showMarkers() && this.presentation()?.marker === 'warning-vocabulary',
  );

  protected readonly markerClass = computed(() => (this.marked() ? 'is-warning-vocabulary' : ''));

  /** Only announced when markers are on, so the aid switch controls both. */
  protected readonly statusLabel = computed(() =>
    this.marked() ? (this.presentation()?.label ?? null) : null,
  );
}
