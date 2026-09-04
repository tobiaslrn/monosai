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
 * than the whole document. It is also where a touch double tap is resolved to
 * a sentence, because the whitespace a reader aims at — the leading between
 * two lines — belongs to the paragraph and to no sentence element.
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
      /* Keep scrolling and pinch-zoom native while the directive recognizes
       * the reader's two-tap sentence gesture. */
      touch-action: manipulation;
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
