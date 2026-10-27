import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import type { ReaderParagraph, ReaderSentence } from '../../application/reading/reader.store';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderSentenceComponent, type SelectedWord } from './reader-sentence.component';

const READING_ID = readingId('r1');
const PARAGRAPH_ID = paragraphId('p1');

function sentence(id: string, japaneseText: string, position: number): ReaderSentence {
  return {
    sentence: {
      id: sentenceId(id),
      readingId: READING_ID,
      paragraphId: PARAGRAPH_ID,
      positionInReading: position,
      positionInParagraph: position,
      japaneseText,
      contentHash: `hash-${id}`,
    },
    tokens: [
      {
        id: `${id}-t1`,
        startUtf16: 0,
        endUtf16: 1,
        surface: japaneseText.charAt(0),
        dictionaryKeys: [japaneseText.charAt(0)],
        partOfSpeech: 'noun',
        isPunctuation: false,
      },
    ],
    statuses: null,
  };
}

/** Two sentences in one paragraph: the case a sentence per line changes. */
const PARAGRAPH: ReaderParagraph = {
  paragraph: {
    id: PARAGRAPH_ID,
    readingId: READING_ID,
    position: 0,
    sourceText: '猫である。犬である。',
  },
  sentences: [sentence('s1', '猫である。', 0), sentence('s2', '犬である。', 1)],
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderParagraphComponent],
  template: `<mn-reader-paragraph
    [entry]="entry()"
    [sentencePerLine]="sentencePerLine()"
    [previewedWord]="previewedWord()"
  />`,
})
class HostComponent {
  readonly entry = signal<ReaderParagraph>(PARAGRAPH);
  readonly sentencePerLine = signal(false);
  readonly previewedWord = signal<SelectedWord | null>(null);
}

describe('ReaderParagraphComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function paragraphElement(fixture: ReturnType<typeof render>): HTMLElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'p.paragraph',
    );
    if (element === null) {
      throw new Error('no paragraph element rendered');
    }
    return element;
  }

  it('keeps sentences run on in the line by default', () => {
    const fixture = render();

    expect(paragraphElement(fixture).classList.contains('is-lined')).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('mn-reader-sentence'),
    ).toHaveLength(2);
  });

  it('marks the paragraph for one sentence per line while the preference is on', () => {
    const fixture = render();

    fixture.componentInstance.sentencePerLine.set(true);
    fixture.detectChanges();
    expect(paragraphElement(fixture).classList.contains('is-lined')).toBe(true);

    fixture.componentInstance.sentencePerLine.set(false);
    fixture.detectChanges();
    expect(paragraphElement(fixture).classList.contains('is-lined')).toBe(false);
  });

  it('hands a word only to the sentence it is in', () => {
    const fixture = render();
    const word = { sentenceId: 's2', tokenId: 's2-t1' };

    fixture.componentInstance.previewedWord.set(word);
    fixture.detectChanges();

    const sentences = fixture.debugElement
      .queryAll(By.directive(ReaderSentenceComponent))
      .map((node) => node.componentInstance as ReaderSentenceComponent);
    expect(sentences.map((sentence) => sentence.previewedWord())).toEqual([null, word]);
  });
});
