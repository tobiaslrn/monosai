import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderParagraph } from '../../application/reading/reader.store';
import type { SentenceId } from '../../domain/shared/ids';
import {
  ReaderSentenceComponent,
  type SentenceMenuRequest,
  type TokenActivation,
} from './reader-sentence.component';

/**
 * One paragraph.
 *
 * Paragraphs are the unit the reader mounts and unmounts, so keeping them a
 * component of their own is what lets a long reading render a window rather
 * than the whole document.
 */
@Component({
  selector: 'mn-reader-paragraph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderSentenceComponent],
  template: `
    <p class="paragraph" [attr.data-paragraph-position]="entry().paragraph.position">
      @for (sentence of entry().sentences; track sentence.sentence.id) {
        <mn-reader-sentence
          [entry]="sentence"
          [aids]="aidsFor(sentence.sentence.id)"
          [furigana]="furigana()"
          [tokenSpacing]="tokenSpacing()"
          [markers]="markers()"
          [current]="currentSentenceId() === sentence.sentence.id"
          [selectedTokenId]="selectedTokenId()"
          (activated)="activated.emit($event)"
          (previewed)="previewed.emit($event)"
          (previewEnded)="previewEnded.emit()"
          (menuRequested)="menuRequested.emit($event)"
        />
      }
    </p>
  `,
  styles: `
    .paragraph {
      margin: 0 0 var(--space-5);
      font-family: var(--font-japanese);
      font-size: var(--reader-font-size);
      /* Furigana needs the taller leading so ruby never overlaps the line above. */
      line-height: var(--reader-line-height-ruby);
    }
  `,
})
export class ReaderParagraphComponent {
  readonly entry = input.required<ReaderParagraph>();
  readonly aids = input<ReadonlyMap<SentenceId, SentenceAids>>(new Map());
  readonly furigana = input(true);
  readonly tokenSpacing = input(true);
  readonly markers = input(true);
  readonly currentSentenceId = input<string | null>(null);
  readonly selectedTokenId = input<string | null>(null);

  readonly activated = output<TokenActivation>();
  readonly previewed = output<TokenActivation>();
  readonly previewEnded = output<void>();
  readonly menuRequested = output<SentenceMenuRequest>();

  protected aidsFor(sentenceId: SentenceId): SentenceAids {
    return this.aids().get(sentenceId) ?? NO_AIDS;
  }
}
