import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderSentence } from '../../application/reading/reader.store';
import { tokensCoveredByConcerns } from '../../domain/enrichment/finding-spans';
import { ReaderTokenComponent, type TokenActivationSource } from './reader-token.component';

/**
 * The open word, identified by its sentence as well as itself.
 *
 * Token ids are unique within a sentence and repeat across them, so a bare id
 * would highlight the first word of every sentence at once.
 */
export interface SelectedWord {
  readonly sentenceId: string;
  readonly tokenId: string;
}

export interface TokenActivation {
  readonly sentence: ReaderSentence;
  readonly token: TokenActivationSource['token'];
  /** The token's own button, which the word popover is anchored to. */
  readonly origin: HTMLElement;
}

/**
 * One sentence of the reading.
 *
 * Japanese and nothing else. A translation is read in the sentence popover and
 * grammar in the word popover, so no English is ever laid out here — the page
 * a learner scrolls is the text they came to read, at the size they chose.
 *
 * The rendered sentence is rebuilt from the stored token slices in order, so
 * spacing and furigana are presentation only and the underlying Japanese is
 * never rewritten.
 */
@Component({
  selector: 'mn-reader-sentence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderTokenComponent],
  template: `
    <span
      class="sentence"
      lang="ja"
      [class.is-spaced]="tokenSpacing()"
      [class.is-selected]="selected()"
      [attr.data-sentence-id]="entry().sentence.id"
    >
      @for (token of entry().tokens; track token.id) {
        <mn-reader-token
          [token]="token"
          [status]="entry().statuses?.get(token.id) ?? null"
          [showFurigana]="furigana()"
          [showMarkers]="markers()"
          [selected]="selectedTokenId() === token.id"
          [grammarConcern]="markers() && concernTokenIds().has(token.id)"
          (activated)="onActivated($event)"
          (previewed)="onPreviewed($event)"
          (previewEnded)="previewEnded.emit()"
        />
      }
    </span>
  `,
  styles: `
    :host {
      display: inline;
    }

    .sentence.is-spaced mn-reader-token {
      margin-inline-end: 0.3em;
    }

    /*
     * Vertical padding on an inline box grows what a press can land on without
     * moving a single glyph, which is half of what makes a sentence clickable
     * with no control printed for it. The other half is the leading, which the
     * paragraph resolves geometrically.
     */
    .sentence {
      /*
       * Constant, never introduced by a state: switching from the initial
       * slice to clone re-applies the inline padding to every wrapped line, so
       * setting it on hover alone nudged the sentence sideways under the
       * pointer.
       */
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      padding-block: 0.55em;
      /*
       * Inline padding lands at the start of a sentence and after its end, so
       * a tinted sentence is inset from the words around it rather than butted
       * against them, and the rounding follows each line fragment.
       */
      padding-inline: 0.4em;
      border-radius: var(--radius-control);
    }

    /*
     * Hovering says a sentence is something you can act on without printing a
     * control on the page. Only the colour changes, so nothing moves.
     */
    @media (hover: hover) {
      .sentence:hover {
        background: var(--surface-sunken);
      }
    }

    /*
     * The open sentence keeps a tint of its own. Without it a popover docked to
     * the bottom of a phone screen would be orphaned from the sentence it is
     * about.
     */
    .sentence.is-selected,
    .sentence.is-selected:hover {
      background: var(--action-primary-soft);
    }
  `,
})
export class ReaderSentenceComponent {
  readonly entry = input.required<ReaderSentence>();
  readonly aids = input<SentenceAids>(NO_AIDS);
  readonly furigana = input(true);
  readonly tokenSpacing = input(true);
  readonly markers = input(true);
  readonly selected = input(false);
  readonly selectedWord = input<SelectedWord | null>(null);

  protected readonly selectedTokenId = computed(() => {
    const word = this.selectedWord();
    return word !== null && word.sentenceId === this.entry().sentence.id ? word.tokenId : null;
  });

  readonly activated = output<TokenActivation>();
  readonly previewed = output<TokenActivation>();
  readonly previewEnded = output<void>();

  /**
   * Words carrying a finding the learner's profile does not cover.
   *
   * Only a finding that supplied a span marks anything: a sentence-level
   * finding is left for the word popover to explain rather than guessed onto
   * an arbitrary word.
   */
  protected readonly concernTokenIds = computed(() => {
    const grammar = this.aids().grammar;
    return grammar === null
      ? new Set<string>()
      : tokensCoveredByConcerns(grammar.findings, this.entry().tokens);
  });

  protected onActivated(activation: TokenActivationSource): void {
    this.activated.emit({ sentence: this.entry(), ...activation });
  }

  protected onPreviewed(activation: TokenActivationSource): void {
    this.previewed.emit({ sentence: this.entry(), ...activation });
  }
}
