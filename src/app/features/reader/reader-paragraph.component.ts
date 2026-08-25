import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderParagraph } from '../../application/reading/reader.store';
import type { SentenceId } from '../../domain/shared/ids';
import { ParagraphGesturesDirective, type SentenceSelection } from './paragraph-gestures.directive';
import {
  ReaderSentenceComponent,
  type SelectedWord,
  type TokenActivation,
} from './reader-sentence.component';

/**
 * One paragraph.
 *
 * Paragraphs are the unit the reader mounts and unmounts, so keeping them a
 * component of their own is what lets a long reading render a window rather
 * than the whole document. It is also where a press is resolved to a sentence,
 * because the whitespace a reader aims at — the leading between two lines —
 * belongs to the paragraph and to no sentence element.
 */
@Component({
  selector: 'mn-reader-paragraph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderSentenceComponent, ParagraphGesturesDirective],
  template: `
    <p
      class="paragraph"
      mnParagraphGestures
      (sentenceSelected)="sentenceSelected.emit($event)"
      [attr.data-paragraph-position]="entry().paragraph.position"
    >
      @for (sentence of entry().sentences; track sentence.sentence.id) {
        <mn-reader-sentence
          [entry]="sentence"
          [aids]="aidsFor(sentence.sentence.id)"
          [furigana]="furigana()"
          [tokenSpacing]="tokenSpacing()"
          [markers]="markers()"
          [selected]="selectedSentenceId() === sentence.sentence.id"
          [playing]="playingSentenceId() === sentence.sentence.id"
          [selectedWord]="selectedWord()"
          [previewedWord]="previewedWord()"
          (activated)="activated.emit($event)"
          (previewed)="previewed.emit($event)"
          (previewEnded)="previewEnded.emit()"
        />
      }
    </p>
  `,
  styles: `
    .paragraph {
      margin: 0 0 var(--reader-paragraph-gap);
      font-family: var(--font-japanese);
      font-size: var(--reader-font-size);
      /*
       * Furigana needs the taller leading so ruby never overlaps the line
       * above, and the same leading is the whitespace a sentence is pressed in.
       */
      line-height: var(--reader-line-height-ruby);
      /*
       * Scrolling and pinch-zoom stay; the browser's own double-tap zoom does
       * not. A reader tapping two words in quick succession was having the
       * second tap held back while the browser waited to see whether it was a
       * zoom, which is what made a word sometimes need pressing twice.
       */
      touch-action: manipulation;
    }

    /*
     * A long press is the reader's gesture for a sentence on touch, and the
     * platform answers the same press by starting a text selection with a
     * callout menu over it. Selecting text with a finger is given up here so
     * the gesture the application does offer works every time; a mouse keeps
     * both, because a mouse selects by dragging rather than by resting.
     */
    @media (pointer: coarse) {
      .paragraph {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
    }
  `,
})
export class ReaderParagraphComponent {
  readonly entry = input.required<ReaderParagraph>();
  readonly aids = input<ReadonlyMap<SentenceId, SentenceAids>>(new Map());
  readonly furigana = input(true);
  readonly tokenSpacing = input(true);
  readonly markers = input(true);
  readonly selectedSentenceId = input<string | null>(null);
  /** The sentence being read aloud, tinted so playback can be followed. */
  readonly playingSentenceId = input<string | null>(null);
  readonly selectedWord = input<SelectedWord | null>(null);
  readonly previewedWord = input<SelectedWord | null>(null);

  readonly activated = output<TokenActivation>();
  readonly previewed = output<TokenActivation>();
  readonly previewEnded = output<void>();
  readonly sentenceSelected = output<SentenceSelection>();

  protected aidsFor(sentenceId: SentenceId): SentenceAids {
    return this.aids().get(sentenceId) ?? NO_AIDS;
  }
}
