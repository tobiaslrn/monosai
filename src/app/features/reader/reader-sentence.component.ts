import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderSentence } from '../../application/reading/reader.store';
import { tokensCoveredByConcerns } from '../../domain/enrichment/finding-spans';
import {
  bunsetsuGroups,
  reviewedPhraseSpans,
  wordAt,
  type WordGroup,
} from '../../domain/reading/token-grouping';
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
  /**
   * The whole word the token belongs to.
   *
   * Resolved here because only the sentence has the tokens around the one that
   * was pressed, and everything downstream — the dictionary lookup, the
   * headword, the highlight — is about the word rather than the morpheme.
   */
  readonly word: WordGroup;
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
  preserveWhitespaces: false,
  template: `
    <span
      class="sentence"
      lang="ja"
      [class.is-spaced]="tokenSpacing()"
      [class.is-selected]="selected()"
      [class.is-playing]="playing()"
      [attr.data-sentence-id]="entry().sentence.id"
    >
      @for (group of groups(); track group.span.startTokenIndex) {
        <span class="bunsetsu-group">
          @for (token of group.tokens; track token.id) {
            <mn-reader-token
              [token]="token"
              [status]="entry().statuses?.get(token.id) ?? null"
              [showFurigana]="furigana()"
              [showMarkers]="markers()"
              [selected]="selectedTokenIds().has(token.id)"
              [previewedState]="previewedTokenIds().has(token.id)"
              [grammarConcern]="markers() && concernTokenIds().has(token.id)"
              (activated)="onActivated($event)"
              (previewed)="onPreviewed($event)"
              (previewEnded)="previewEnded.emit()"
            />
          }
        </span>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline;
    }

    /*
     * The gap falls between bunsetsu, not between morphemes, and there is none
     * inside one — so it is wider than a per-token gap could be without the
     * line falling apart. The margin is on the atomic wrapper so a normal line
     * break cannot strand half a bunsetsu on the previous line.
     */
    .sentence.is-spaced .bunsetsu-group:not(:first-child) {
      margin-inline-start: 0.5em;
      max-inline-size: calc(100% - 0.5em);
    }

    /*
     * A fitting bunsetsu is one inline-block, so the browser can move the
     * complete group to the next line. If even one group is wider than the
     * measure, the max size turns it into a wrapping inline-block as a last
     * resort. Normal Japanese line breaking remains authoritative, with strict
     * punctuation rules; anywhere only supplies an emergency break for an
     * otherwise unbreakable token.
     */
    .bunsetsu-group {
      display: inline-block;
      box-sizing: border-box;
      max-inline-size: 100%;
      max-width: 100%;
      white-space: normal;
      word-break: normal;
      line-break: strict;
      overflow-wrap: anywhere;
      vertical-align: baseline;
    }

    /*
     * Vertical padding on an inline box grows what a press can land on without
     * moving a single glyph, which is half of what makes a sentence clickable
     * with no control printed for it. The other half is the leading, which the
     * paragraph resolves geometrically.
     */
    .sentence {
      /* A tint fades in rather than snapping, which is what a press on a
       * sentence feels like on a phone. */
      transition: background-color var(--motion-fast) ease-out;
      /* The platform's grey flash would fight every tint defined here. */
      -webkit-tap-highlight-color: transparent;
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
       *
       * It is cancelled by an equal negative margin, because the padding of two
       * neighbouring sentences meets in the middle of a line: at 0.4em each,
       * that was 0.8em of dead space between the end of one sentence and the
       * start of the next, in the middle of running prose. The negative margin
       * pulls the boxes back over each other so the text flows at its natural
       * spacing while both the hit area and the tinted shape keep their inset.
       */
      padding-inline: 0.25em;
      margin-inline: -0.25em;
      border-radius: var(--radius-control);
    }

    /*
     * Hovering says a sentence is something you can act on without printing a
     * control on the page. Only the colour changes, so nothing moves.
     *
     * A mouse only. A phone answers a tap with a synthesized hover that it
     * never takes back, so on touch this used to leave a whole sentence shaded
     * behind every tap — including taps that did nothing at all. "data-pointer"
     * follows the hardware, so a touchscreen laptop is covered too.
     */
    :host-context(html[data-pointer='mouse']) .sentence:hover {
      background: var(--surface-sunken);
    }

    /*
     * The sentence a finger is resting on, while the long press is being timed.
     * The class is put on by the paragraph's gesture directive, which is the
     * only thing that knows which sentence a press in the leading belongs to.
     */
    .sentence.is-pressing {
      background: var(--surface-sunken);
    }

    @media (prefers-reduced-motion: reduce) {
      .sentence {
        transition: none;
      }
    }

    /*
     * The open sentence keeps a tint of its own. Without it an anchored
     * popover would be orphaned from the sentence it is about.
     *
     * The same colour a word is tinted with, because it means the same thing —
     * this is what the open surface is about — and only one of the two can be
     * open at a time. Two colours for one idea read as two kinds of selection
     * a reader could not tell apart or choose between.
     */
    .sentence.is-selected,
    .sentence.is-selected:hover {
      background: var(--accent-secondary-soft);
    }

    /*
     * The sentence being read aloud. A tint rather than an outline, so a line
     * does not change height as playback moves through the paragraph, and a
     * different one from the open sentence, because both can be true at once.
     */
    .sentence.is-playing,
    .sentence.is-playing:hover {
      background: var(--playing-sentence-soft);
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
  /** True for the sentence currently being read aloud. */
  readonly playing = input(false);
  readonly selectedWord = input<SelectedWord | null>(null);
  readonly previewedWord = input<SelectedWord | null>(null);

  /**
   * Presentation-only bunsetsu, computed from the whole sentence because a
   * group boundary depends on the token before it and on reviewed phrases that
   * cover it.
   */
  protected readonly groups = computed(() => {
    const entry = this.entry();
    return bunsetsuGroups(entry.tokens, reviewedPhraseSpans(entry.tokens, entry.statuses));
  });

  /**
   * The tokens tinted as the open word.
   *
   * A word is one thing to the learner even when the analyzer split it into a
   * stem and an ending, so opening あります highlights あります rather than the
   * half of it that was pressed.
   */
  protected readonly selectedTokenIds = computed(() => {
    return this.tokenIdsForWord(this.selectedWord());
  });

  /** Hover and focus use the same whole-word boundary as the pinned lookup. */
  protected readonly previewedTokenIds = computed(() => this.tokenIdsForWord(this.previewedWord()));

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
    this.activated.emit(this.withWord(activation));
  }

  protected onPreviewed(activation: TokenActivationSource): void {
    this.previewed.emit(this.withWord(activation));
  }

  private withWord(activation: TokenActivationSource): TokenActivation {
    const entry = this.entry();
    // The token was rendered from this sentence, so it is always one of these.
    const index = entry.tokens.findIndex((token) => token.id === activation.token.id);
    return { sentence: entry, ...activation, word: wordAt(entry.tokens, Math.max(index, 0)) };
  }

  private tokenIdsForWord(word: SelectedWord | null): ReadonlySet<string> {
    const entry = this.entry();
    if (word?.sentenceId !== entry.sentence.id) {
      return new Set<string>();
    }
    const index = entry.tokens.findIndex((token) => token.id === word.tokenId);
    if (index < 0) {
      return new Set<string>();
    }
    return new Set(wordAt(entry.tokens, index).tokens.map((token) => token.id));
  }
}
