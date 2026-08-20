import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  IDLE_ACTION,
  NO_AIDS,
  type SentenceAids,
} from '../../application/enrichment/sentence-aids.store';
import type { ReaderSentence } from '../../application/reading/reader.store';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import {
  ReaderSentenceComponent,
  type SentenceMenuRequest,
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
    japaneseText: '猫が walked。',
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

function analysis(
  overrides: Partial<GrammarAnalysisRecord['findings'][number]> = {},
): GrammarAnalysisRecord {
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
  return {
    ...NO_AIDS,
    translationAction: IDLE_ACTION,
    grammarAction: IDLE_ACTION,
    ...overrides,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderSentenceComponent],
  template: `<p>
    <mn-reader-sentence
      [entry]="entry"
      [aids]="aids()"
      (activated)="activations.push($event)"
      (menuRequested)="menuRequests.push($event)"
    />
  </p>`,
})
class HostComponent {
  readonly entry = ENTRY;
  readonly aids = signal<SentenceAids>(NO_AIDS);
  readonly activations: TokenActivation[] = [];
  readonly menuRequests: SentenceMenuRequest[] = [];
}

describe('ReaderSentenceComponent', () => {
  function render(aids: SentenceAids = NO_AIDS) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.aids.set(aids);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('marks the Japanese and the English with their own languages', () => {
    const element = render(
      aidsWith({ translation: translation('The cat walked.'), translationVisible: true }),
    );

    expect(element.querySelector('.sentence')?.getAttribute('lang')).toBe('ja');
    expect(element.querySelector('.translation')?.getAttribute('lang')).toBe('en');
  });

  it('renders a translation only while it is visible', () => {
    const record = translation('The cat walked.');

    expect(
      render(aidsWith({ translation: record, translationVisible: true })).textContent,
    ).toContain('The cat walked.');
    expect(
      render(aidsWith({ translation: record, translationVisible: false })).textContent,
    ).not.toContain('The cat walked.');
  });

  it('renders provider text as text, never as markup', () => {
    const element = render(
      aidsWith({
        translation: translation('<script>alert(1)</script>The cat walked.'),
        translationVisible: true,
      }),
    );

    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('.translation')?.textContent).toContain(
      '<script>alert(1)</script>',
    );
  });

  it('shows a grammar finding with a worded confidence band and no percentage', () => {
    const element = render(aidsWith({ grammar: analysis(), concernCount: 1 }));
    const grammar = element.querySelector('.grammar');

    expect(grammar?.textContent).toContain('が as subject marker');
    expect(grammar?.textContent).toContain('Confident');
    expect(grammar?.textContent).not.toMatch(/\d+\s*%/);
  });

  it('names a stale analysis rather than hiding it', () => {
    const element = render(aidsWith({ grammar: analysis(), grammarStale: true }));

    expect(element.querySelector('.stale')?.textContent).toContain('earlier grammar profile');
  });

  it('marks the sentence for a concern, and a token only for a covering span', () => {
    const sentenceLevel = render(aidsWith({ grammar: analysis(), concernCount: 1 }));
    expect(sentenceLevel.querySelector('.sentence.has-concern')).not.toBeNull();
    expect(sentenceLevel.querySelector('.token.has-concern')).toBeNull();

    const spanned = render(
      aidsWith({
        grammar: analysis({ startUtf16: 1, endUtf16: 2 }),
        concernCount: 1,
      }),
    );
    const marked = spanned.querySelectorAll('.token.has-concern');
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toContain('が');
  });

  it('renders no aid slots when a sentence has none', () => {
    const element = render();

    expect(element.querySelector('.translation')).toBeNull();
    expect(element.querySelector('.grammar')).toBeNull();
  });

  it('keeps a word click and a whitespace click apart', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element
      .querySelector('button.token')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.activations).toHaveLength(1);
    expect(fixture.componentInstance.menuRequests).toHaveLength(0);

    element.querySelector('.sentence')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.activations).toHaveLength(1);
    expect(fixture.componentInstance.menuRequests).toHaveLength(1);
  });

  it('offers a focus-revealed control that names its sentence', () => {
    const element = render();
    const control = element.querySelector<HTMLButtonElement>('.sentence-actions');

    expect(control?.textContent.trim()).toBe('Actions for sentence 1');
  });

  it('opens the menu from the focus-revealed control, returning focus to it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const control = element.querySelector<HTMLButtonElement>('.sentence-actions');

    control?.click();

    const [request] = fixture.componentInstance.menuRequests;
    expect(request.returnFocusTo).toBe(control);
    expect(fixture.componentInstance.activations).toHaveLength(0);
  });
});
