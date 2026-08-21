import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageStore } from '../../application/language/language.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { LANGUAGE_RUNTIME } from '../../application/shared/language-tokens';
import type { GrammarFinding } from '../../domain/enrichment/records';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { wordAt } from '../../domain/reading/token-grouping';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
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

/** One dictionary entry with `count` distinct meanings. */
function entryWith(count: number) {
  return {
    id: 'e1',
    writtenForms: ['猫'],
    readings: ['ねこ'],
    senses: Array.from({ length: count }, (_unused, index) => ({
      glossesEn: [`meaning ${String(index + 1)}`],
      partsOfSpeech: [],
    })),
  };
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
  /** What the bundled dictionary returns for the next lookup. */
  let entries: ReturnType<typeof entryWith>[];

  beforeEach(() => {
    entries = [];
    TestBed.configureTestingModule({
      providers: [
        WordInspectorStore,
        {
          provide: LANGUAGE_RUNTIME,
          useValue: { lookup: () => Promise.resolve(ok({ matchedBy: 'surface', entries })) },
        },
        { provide: LanguageStore, useValue: { structuralBaseline: signal([]) } },
      ],
    });
  });

  async function render(
    grammar: WordGrammarState = NO_WORD_GRAMMAR,
    token: Token = TOKEN,
    status: TokenStatusAssignment | null = null,
  ) {
    await TestBed.inject(WordInspectorStore).inspect({
      token,
      word: wordAt([token], 0),
      sentence: SENTENCE,
      status,
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

  /**
   * A heading over a line saying nothing happened is not information. An
   * unanalyzed sentence has no grammar section at all; the offer to analyse one
   * lives on the sentence, where every request-spending action lives.
   */
  it('shows no grammar section at all for an unanalyzed sentence', async () => {
    const unanalyzed = (await render()).nativeElement as HTMLElement;

    expect(unanalyzed.querySelector('.grammar-section')).toBeNull();
    expect(unanalyzed.textContent).not.toContain('Grammar here');

    TestBed.resetTestingModule();
  });

  /**
   * A heading over a line saying nothing happened is not information: an
   * analyzed sentence with nothing to report about this word gets no grammar
   * section at all, same as an unanalyzed one.
   */
  it('shows no grammar section for an analyzed sentence with nothing to report', async () => {
    const element = (await render(grammarWith({ analyzed: true }))).nativeElement as HTMLElement;

    expect(element.querySelector('.grammar-section')).toBeNull();
    expect(element.textContent).not.toContain('Nothing here is outside your grammar profile.');
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

  /**
   * Word details are a read-only local lookup, so nothing here should send the
   * learner off to configure Anki. Reading works without it, and saying so at
   * every word said it far too often.
   */
  it('says nothing about Anki when no vocabulary is configured', async () => {
    const element = (await render()).nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Connect Anki');
  });

  /**
   * The reader marks warnings and nothing else: a word already reviewed is
   * simply readable, and saying so in the inspector is the same clutter as
   * saying it on the page.
   */
  it('shows no status section for a word that needs no warning', async () => {
    const element = (
      await render(NO_WORD_GRAMMAR, TOKEN, {
        tokenId: TOKEN.id,
        validation: { category: 'anki-exact', vocabularyItemIds: [] },
      })
    ).nativeElement as HTMLElement;

    expect(element.querySelector('.status')).toBeNull();
    expect(element.textContent).not.toContain('Known from Anki');
  });

  it('shows the status section for a word that needs a warning', async () => {
    const element = (
      await render(NO_WORD_GRAMMAR, TOKEN, {
        tokenId: TOKEN.id,
        validation: { category: 'unknown', reason: 'not-in-vocabulary' },
      })
    ).nativeElement as HTMLElement;

    expect(element.querySelector('.status')?.textContent).toContain('Unknown vocabulary');
    expect(element.textContent).toContain('Review this word in Anki');
  });

  describe('the dictionary form', () => {
    it('is shown when the word on the page is inflected', async () => {
      const element = (
        await render(NO_WORD_GRAMMAR, { ...TOKEN, surface: '歩いた', lemma: '歩く' })
      ).nativeElement as HTMLElement;

      expect(element.textContent).toContain('Dictionary form');
      expect(element.querySelector('.facts dd')?.textContent).toContain('歩く');
    });

    it('is left out when it is the same word already on the page', async () => {
      const element = (await render(NO_WORD_GRAMMAR, { ...TOKEN, lemma: TOKEN.surface }))
        .nativeElement as HTMLElement;

      expect(element.querySelector('.facts')).toBeNull();
      expect(element.textContent).not.toContain('Part of speech');
    });
  });

  describe('meanings', () => {
    it('shows the first two and holds the rest behind More', async () => {
      entries = [entryWith(5)];
      const element = (await render()).nativeElement as HTMLElement;

      expect(element.querySelectorAll('.glosses li')).toHaveLength(2);
      expect(element.textContent).toContain('More (3)');
    });

    it('shows every meaning once More is pressed', async () => {
      entries = [entryWith(5)];
      const fixture = await render();
      const element = fixture.nativeElement as HTMLElement;

      element.querySelector<HTMLButtonElement>('.more')?.click();
      fixture.detectChanges();

      expect(element.querySelectorAll('.glosses li')).toHaveLength(5);
      expect(element.querySelector('.more')).toBeNull();
    });

    it('offers no More when the entry is short enough to show whole', async () => {
      entries = [entryWith(2)];
      const element = (await render()).nativeElement as HTMLElement;

      expect(element.querySelectorAll('.glosses li')).toHaveLength(2);
      expect(element.querySelector('.more')).toBeNull();
    });
  });
});
