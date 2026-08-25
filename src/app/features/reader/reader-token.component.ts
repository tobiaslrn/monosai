import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PointerModalityService } from '../../core/platform/pointer-modality.service';
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
        [class.is-previewed]="previewedState()"
        (click)="onActivate($event)"
        (focus)="onPreview($event)"
        (pointerenter)="onPreview($event)"
        (blur)="previewEnded.emit()"
        (pointerleave)="previewEnded.emit()"
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
      /* The platform's own grey flash would fight the tint below. */
      -webkit-tap-highlight-color: transparent;
      transition: background-color var(--motion-fast) ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .token {
        transition: none;
      }
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

    /*
     * One tint for a word, in one colour, in every state that means "this is
     * the word being looked at": hovered, focused, held, and open. A second
     * colour said nothing a learner could act on — only one word is ever the
     * subject — and on a phone the hover tint arrived alongside the open tint
     * and left two words looking chosen at once.
     */
    button.token:focus-visible,
    button.token.is-previewed,
    button.token.is-selected {
      background: var(--accent-secondary-soft);
      border-radius: 4px;
    }

    /*
     * Hover belongs to a mouse. A phone synthesizes "mouseenter" on tap and
     * never takes it back, which left a tinted word behind after every tap;
     * "data-pointer" follows the hardware rather than the media query, so a
     * touchscreen laptop gets the same treatment while a finger is in use.
     */
    :host-context(html[data-pointer='mouse']) button.token:hover {
      background: var(--accent-secondary-soft);
      border-radius: 4px;
    }

    /*
     * The press itself is answered, before anything opens. On a phone this is
     * the whole of the feedback between a tap and its sheet, and its absence
     * was most of why tapping a word felt like nothing had happened.
     */
    button.token:active {
      background: var(--accent-secondary-soft);
      border-radius: 4px;
    }

    /*
     * A finger is not a pointer tip. Vertical padding on an inline box grows
     * what a press can land on, reaching into the leading that the ruby line
     * makes generous, without moving a single glyph.
     *
     * A media query rather than the pointer attribute, unlike the paint-only
     * rules above: this one changes layout, and a hit area that appears in the
     * middle of the very gesture that asked for it is one the browser then
     * hands to the line behind the word — a tap that does nothing at all.
     * A device's pointer does not change; which one last touched the page does.
     *
     * Words only: punctuation and whitespace are rendered with the same class
     * but are not targets, and padding one of them out pushes the line it sits
     * on around.
     */
    @media (pointer: coarse) {
      button.token {
        padding-block: 0.4em;
      }
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

    /*
     * Ruby is sized so that a long reading does not stretch its base.
     *
     * A ruby annotation is laid out as an inline box over its base, and when it
     * is wider the base is stretched to match. A slightly compact size and
     * negative tracking keep long readings from tearing holes in the sentence
     * while remaining comfortably legible on a phone.
     *
     * The size was chosen by reading real text in the browser, not by
     * arithmetic: smaller closes the gaps further but the kana stop being
     * legible, which would trade one failure for a worse one.
     */
    rt {
      font-size: 0.47em;
      letter-spacing: -0.02em;
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
  private readonly pointerModality = inject(PointerModalityService);

  readonly token = input.required<Token>();
  readonly status = input<TokenStatusAssignment | null>(null);
  readonly showFurigana = input(true);
  readonly showMarkers = input(true);
  readonly selected = input(false);
  readonly previewedState = input(false);
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

  /**
   * Offers the hover preview to a mouse and a keyboard, and to nothing else.
   *
   * A tap both focuses a word and synthesizes a pointer entering it, so on a
   * phone this fired twice for every tap and put a preview card on screen that
   * the tap's own details card then replaced.
   */
  protected onPreview(event: Event): void {
    if (this.pointerModality.isTouch()) {
      return;
    }
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
