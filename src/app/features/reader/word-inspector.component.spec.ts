import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageStore } from '../../application/language/language.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { LANGUAGE_RUNTIME } from '../../application/shared/language-tokens';
import type { GrammarFinding } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
import { ok } from '../../domain/shared/result';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import {
  NO_WORD_GRAMMAR,
  WordInspectorComponent,
  type WordGrammarState,
} from './word-inspector.component';

const TOKEN: Token = {
  id: 't1',
  startUtf16: 0,
  endUtf16: 1,
  surface: '猫',
  readingHiragana: 'ねこ',
  partOfSpeech: 'noun',
  dictionaryKeys: ['猫'],
  isPunctuation: false,
};

const SENTENCE: Sentence = {
  id: sentenceId('s1'),
  readingId: readingId('r1'),
  paragraphId: paragraphId('p1'),
  japaneseText: '猫がいる。',
  contentHash: 'h1',
  positionInParagraph: 0,
  positionInReading: 0,
};

const FINDING: GrammarFinding = {
  label: 'が as subject marker',
  explanationEn: 'Marks who performs the action.',
  confidence: 'high',
  inProfile: false,
};

function grammarWith(overrides: Partial<WordGrammarState>): WordGrammarState {
  return { ...NO_WORD_GRAMMAR, ...overrides };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WordInspectorComponent],
  template: `<mn-word-inspector
    [grammar]="grammar()"
    (sentenceRequested)="sentenceRequests = sentenceRequests + 1"
  />`,
})
class HostComponent {
  readonly grammar = signal<WordGrammarState>(NO_WORD_GRAMMAR);
  sentenceRequests = 0;
}

describe('WordInspectorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WordInspectorStore,
        {
          provide: LANGUAGE_RUNTIME,
          useValue: { lookup: () => Promise.resolve(ok({ matchedBy: 'surface', entries: [] })) },
        },
        { provide: LanguageStore, useValue: { structuralBaseline: signal([]) } },
      ],
    });
  });

  async function render(grammar: WordGrammarState = NO_WORD_GRAMMAR) {
    await TestBed.inject(WordInspectorStore).inspect({
      token: TOKEN,
      sentence: SENTENCE,
      status: null,
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.grammar.set(grammar);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the grammar covering this word, where the reader stopped', async () => {
    const element = (await render(grammarWith({ findings: [FINDING], analyzed: true })))
      .nativeElement as HTMLElement;

    expect(element.textContent).toContain('が as subject marker');
    expect(element.textContent).toContain('Marks who performs the action.');
  });

  it('says a sentence is unanalyzed rather than implying it is clean', async () => {
    const unanalyzed = (await render()).nativeElement as HTMLElement;
    expect(unanalyzed.textContent).toContain('has not been analyzed');

    TestBed.resetTestingModule();
  });

  it('distinguishes an analyzed sentence with nothing to report', async () => {
    const element = (await render(grammarWith({ analyzed: true }))).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Nothing here is outside your grammar profile.');
  });

  it('spends nothing: every action lives on the sentence', async () => {
    // A word is a lookup. Keeping requests off it means a reader can open one
    // as often as they like without wondering what it cost.
    const element = (await render(grammarWith({ analyzed: true, stale: true })))
      .nativeElement as HTMLElement;
    const labels = [...element.querySelectorAll('button')].map((button) => button.textContent);

    expect(labels.join(' ')).not.toContain('nalyze');
    expect(element.textContent).toContain('earlier grammar profile');
  });

  it('does not repeat the sentence the reader is looking at', async () => {
    const element = (await render()).nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('In this sentence');
    expect(element.textContent).not.toContain(SENTENCE.japaneseText);
  });

  it('shows a finding said about the sentence, which marks no word at all', async () => {
    // Nothing on the page can carry it, so every word of the sentence does.
    const wide: GrammarFinding = {
      label: 'Topic-comment order',
      explanationEn: 'The sentence names its topic first.',
      confidence: 'medium',
      inProfile: false,
    };
    const element = (await render(grammarWith({ sentenceFindings: [wide], analyzed: true })))
      .nativeElement as HTMLElement;

    expect(element.textContent).toContain('Topic-comment order');
    expect(element.textContent).toContain('whole sentence');
    expect(element.textContent).not.toContain('Nothing here is outside your grammar profile.');
  });

  it('keeps its route to the sentence out of sight until it holds focus', async () => {
    const element = (await render()).nativeElement as HTMLElement;
    const route = element.querySelector<HTMLButtonElement>('.sentence-route');

    // Laid out only while focused, so the card reads as a plain lookup.
    expect(route?.textContent.trim()).toBe('Open this sentence');
    expect(getComputedStyle(route!).position).toBe('absolute');
  });

  it('carries the keyboard route to the sentence, where the actions are', async () => {
    // Selecting a sentence is a press on its whitespace, which a keyboard
    // cannot aim; this is how it is reached instead.
    const fixture = await render();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sentence-route')
      ?.click();

    expect(fixture.componentInstance.sentenceRequests).toBe(1);
  });
});
