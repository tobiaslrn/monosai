import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import type { ReaderSentence } from '../../application/reading/reader.store';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import {
  ReaderSentenceComponent,
  type SelectedWord,
  type TokenActivation,
} from './reader-sentence.component';

const READING_ID = readingId('r1');
const SENTENCE_ID = sentenceId('s1');

const ENTRY: ReaderSentence = {
  sentence: {
    id: SENTENCE_ID,
    readingId: READING_ID,
    paragraphId: paragraphId('p1'),
    positionInReading: 0,
    positionInParagraph: 0,
    japaneseText: '猫が。',
    contentHash: 'hash-0',
  },
  tokens: [
    {
      id: 't1',
      startUtf16: 0,
      endUtf16: 1,
      surface: '猫',
      readingHiragana: 'ねこ',
      partOfSpeech: 'noun',
      dictionaryKeys: ['猫'],
      isPunctuation: false,
    },
    {
      id: 't2',
      startUtf16: 1,
      endUtf16: 2,
      surface: 'が',
      partOfSpeech: 'particle',
      dictionaryKeys: ['が'],
      isPunctuation: false,
    },
  ],
  statuses: null,
};

/** 名前 が あり ます: one noun, one particle, and one word split in two. */
const INFLECTED: ReaderSentence = {
  sentence: { ...ENTRY.sentence, japaneseText: 'あります。' },
  tokens: [
    {
      id: 'i1',
      startUtf16: 0,
      endUtf16: 2,
      surface: 'あり',
      lemma: 'ある',
      partOfSpeech: 'verb',
      dictionaryKeys: ['あり'],
      isPunctuation: false,
    },
    {
      id: 'i2',
      startUtf16: 2,
      endUtf16: 4,
      surface: 'ます',
      lemma: 'ます',
      partOfSpeech: 'auxiliary',
      dictionaryKeys: ['ます'],
      isPunctuation: false,
    },
  ],
  statuses: null,
};

const MULTI_GROUPED: ReaderSentence = {
  sentence: { ...ENTRY.sentence, japaneseText: '名前があります。' },
  tokens: [
    {
      id: 'm1',
      startUtf16: 0,
      endUtf16: 2,
      surface: '名前',
      readingHiragana: 'なまえ',
      partOfSpeech: 'noun',
      dictionaryKeys: ['名前'],
      isPunctuation: false,
    },
    {
      id: 'm2',
      startUtf16: 2,
      endUtf16: 3,
      surface: 'が',
      readingHiragana: 'が',
      partOfSpeech: 'particle',
      dictionaryKeys: ['が'],
      isPunctuation: false,
    },
    {
      id: 'm3',
      startUtf16: 3,
      endUtf16: 5,
      surface: 'あり',
      lemma: 'ある',
      readingHiragana: 'あり',
      partOfSpeech: 'verb',
      dictionaryKeys: ['あり'],
      isPunctuation: false,
    },
    {
      id: 'm4',
      startUtf16: 5,
      endUtf16: 7,
      surface: 'ます',
      lemma: 'ます',
      readingHiragana: 'ます',
      partOfSpeech: 'auxiliary',
      dictionaryKeys: ['ます'],
      isPunctuation: false,
    },
    {
      id: 'm5',
      startUtf16: 7,
      endUtf16: 8,
      surface: '。',
      dictionaryKeys: [],
      isPunctuation: true,
    },
  ],
  statuses: null,
};

function translation(textEn: string): TranslationRecord {
  return {
    id: 't-1',
    sentenceId: SENTENCE_ID,
    readingId: READING_ID,
    sourceContentHash: 'hash-0',
    textEn,
    modelId: 'vendor/model',
    promptVersion: 'translation/1',
    cacheKey: 'key-1',
    createdAt: 1,
  };
}

function analysis(overrides: Record<string, unknown> = {}): GrammarAnalysisRecord {
  return {
    id: 'g-1',
    sentenceId: SENTENCE_ID,
    readingId: READING_ID,
    sourceContentHash: 'hash-0',
    profileHash: 'profile-1',
    modelId: 'vendor/model',
    promptVersion: 'grammar/1',
    findings: [
      {
        label: 'が as subject marker',
        explanationEn: 'Marks who performs the action.',
        confidence: 'high',
        inProfile: false,
        ...overrides,
      },
    ],
    cacheKey: 'key-g1',
    createdAt: 1,
  };
}

function aidsWith(overrides: Partial<SentenceAids>): SentenceAids {
  return { ...NO_AIDS, ...overrides };
}

function renderedSurface(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('rt, .mn-visually-hidden').forEach((node) => {
    node.remove();
  });
  return copy.textContent.replace(/\s+/g, '');
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderSentenceComponent],
  template: `<p>
    <mn-reader-sentence
      [entry]="entry()"
      [aids]="aids()"
      [furigana]="furigana()"
      [tokenSpacing]="tokenSpacing()"
      [markers]="markers()"
      [selected]="selected()"
      [selectedWord]="selectedWord()"
      [previewedWord]="previewedWord()"
      (activated)="activations.push($event)"
    />
  </p>`,
})
class HostComponent {
  readonly entry = signal<ReaderSentence>(ENTRY);
  readonly aids = signal<SentenceAids>(NO_AIDS);
  readonly furigana = signal(true);
  readonly tokenSpacing = signal(true);
  readonly markers = signal(true);
  readonly selected = signal(false);
  readonly selectedWord = signal<SelectedWord | null>(null);
  readonly previewedWord = signal<SelectedWord | null>(null);
  readonly activations: TokenActivation[] = [];
}

describe('ReaderSentenceComponent', () => {
  function render(aids: SentenceAids = NO_AIDS) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.aids.set(aids);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the Japanese, marked as Japanese', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.sentence')?.getAttribute('lang')).toBe('ja');
    expect(element.textContent).toContain('猫');
  });

  it('renders each bunsetsu in an atomic wrapper without inserting whitespace', () => {
    const fixture = render();
    fixture.componentInstance.entry.set(MULTI_GROUPED);
    fixture.detectChanges();
    const sentence = (fixture.nativeElement as HTMLElement).querySelector('.sentence');
    const groups = [...(sentence?.querySelectorAll('.bunsetsu-group') ?? [])];

    expect(renderedSurface(sentence!)).toBe('名前があります。');
    expect(groups.map((group) => renderedSurface(group))).toEqual(['名前が', 'あります。']);
    expect([...sentence!.childNodes].filter((node) => node.nodeType === 3)).toHaveLength(0);
    expect(
      groups.flatMap((group) => [...group.childNodes]).filter((node) => node.nodeType === 3),
    ).toHaveLength(0);
  });

  it('never lays out English, however much is stored for the sentence', () => {
    // The whole point of the reading surface: a sentence with a translation and
    // an analysis renders exactly as one with neither.
    const element = render(
      aidsWith({
        translation: translation('The cat.'),
        grammar: analysis(),
        concernCount: 1,
      }),
    ).nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('The cat.');
    expect(element.textContent).not.toContain('Marks who performs the action.');
    expect(element.querySelector('[lang="en"]')).toBeNull();
  });

  it('prints no control for the sentence', () => {
    // Only the words are buttons. The sentence is reached by pressing it.
    const element = render().nativeElement as HTMLElement;
    const buttons = [...element.querySelectorAll('button')];

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.classList.contains('token'))).toBe(true);
  });

  it('carries the sentence id a press resolves to', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.sentence')?.getAttribute('data-sentence-id')).toBe(SENTENCE_ID);
  });

  it('is a programmatic focus target without becoming another tab stop', () => {
    const sentence = (render().nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.sentence',
    );

    expect(sentence?.tabIndex).toBe(-1);
    sentence?.focus();
    expect(document.activeElement).toBe(sentence);
  });

  it('tints the open sentence, so a docked sheet is not orphaned from it', () => {
    const fixture = render();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.sentence.is-selected'),
    ).toBeNull();

    fixture.componentInstance.selected.set(true);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.sentence.is-selected'),
    ).not.toBeNull();
  });

  it('marks a word only when a finding supplies a span covering it', () => {
    const sentenceLevel = render(aidsWith({ grammar: analysis(), concernCount: 1 }))
      .nativeElement as HTMLElement;
    expect(sentenceLevel.querySelector('.has-grammar-concern')).toBeNull();

    const spanned = render(
      aidsWith({ grammar: analysis({ startUtf16: 1, endUtf16: 2 }), concernCount: 1 }),
    ).nativeElement as HTMLElement;
    const marked = spanned.querySelectorAll('mn-reader-token.has-grammar-concern');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('が');
  });

  it('opens a gap between bunsetsu rather than between morphemes', () => {
    // The spacing aid must not print analyzer internals: が belongs to the noun
    // it marks, so no gap is drawn before it.
    const element = render().nativeElement as HTMLElement;
    const opening = [...element.querySelectorAll('.bunsetsu-group')];

    expect(opening).toHaveLength(1);
    expect(opening[0].textContent).toContain('猫');
  });

  it('moves the spacing aid to group boundaries while leaving furigana optional', () => {
    const fixture = render();
    fixture.componentInstance.entry.set(MULTI_GROUPED);
    fixture.componentInstance.furigana.set(false);
    fixture.componentInstance.tokenSpacing.set(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.sentence')?.classList.contains('is-spaced')).toBe(false);
    expect(element.querySelectorAll('.bunsetsu-group')).toHaveLength(2);
    expect(element.querySelectorAll('mn-reader-token.starts-bunsetsu')).toHaveLength(0);
    expect(element.querySelectorAll('rt')).toHaveLength(0);

    fixture.componentInstance.tokenSpacing.set(true);
    fixture.componentInstance.furigana.set(true);
    fixture.detectChanges();

    expect(element.querySelector('.sentence')?.classList.contains('is-spaced')).toBe(true);
    expect(element.querySelectorAll('.bunsetsu-group')).toHaveLength(2);
    expect(element.querySelectorAll('rt')).toHaveLength(1);
  });

  it('activates the whole word, not the morpheme that was pressed', () => {
    // あり on its own is 蟻, "ant": everything downstream must be about あります.
    const fixture = render();
    fixture.componentInstance.entry.set(INFLECTED);
    fixture.detectChanges();

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button.token')];
    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const [activation] = fixture.componentInstance.activations;
    expect(activation.token.surface, 'the pressed morpheme is still reported').toBe('ます');
    expect(activation.word.surface).toBe('あります');
    expect(activation.word.head.lemma).toBe('ある');
  });

  it('tints every part of the open word', () => {
    const fixture = render();
    fixture.componentInstance.entry.set(INFLECTED);
    fixture.componentInstance.selectedWord.set({ sentenceId: SENTENCE_ID, tokenId: 'i2' });
    fixture.detectChanges();

    const selected = (fixture.nativeElement as HTMLElement).querySelectorAll('button.is-selected');
    expect([...selected].map((element) => element.textContent.trim())).toEqual(['あり', 'ます']);
  });

  it('tints every part of the hovered word', () => {
    const fixture = render();
    fixture.componentInstance.entry.set(INFLECTED);
    fixture.componentInstance.previewedWord.set({ sentenceId: SENTENCE_ID, tokenId: 'i2' });
    fixture.detectChanges();

    const previewed = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button.is-previewed',
    );
    expect([...previewed].map((element) => element.textContent.trim())).toEqual(['あり', 'ます']);
  });

  it('activates a word without the press reaching the paragraph', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    let reachedParagraph = 0;
    element.querySelector('p')?.addEventListener('click', () => {
      reachedParagraph += 1;
    });

    element
      .querySelector('button.token')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.activations).toHaveLength(1);
    expect(reachedParagraph, 'a word press is never also a sentence press').toBe(0);
  });
});
