import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import { aiError } from '../../domain/ai/ai-error';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import { readingId, sentenceId } from '../../domain/shared/ids';
import { SentencePopoverComponent, type UnknownWord } from './sentence-popover.component';

const SENTENCE_ID = sentenceId('s1');

function translation(textEn: string): TranslationRecord {
  return {
    id: 't-1',
    sentenceId: SENTENCE_ID,
    readingId: readingId('r1'),
    sourceContentHash: 'hash-0',
    textEn,
    modelId: 'vendor/model',
    promptVersion: 'translation/1',
    cacheKey: 'key-1',
    createdAt: 1,
  };
}

function analysis(inProfile: boolean): GrammarAnalysisRecord {
  return {
    id: 'g-1',
    sentenceId: SENTENCE_ID,
    readingId: readingId('r1'),
    sourceContentHash: 'hash-0',
    profileHash: 'profile-1',
    modelId: 'vendor/model',
    promptVersion: 'grammar/1',
    findings: [
      {
        label: 'である copula',
        explanationEn: 'A formal written equivalent of です.',
        confidence: 'high',
        inProfile,
      },
    ],
    cacheKey: 'key-g1',
    createdAt: 1,
  };
}

function aidsWith(overrides: Partial<SentenceAids>): SentenceAids {
  return { ...NO_AIDS, ...overrides };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SentencePopoverComponent],
  template: `<mn-sentence-popover
    [aids]="aids()"
    [canAnalyze]="canAnalyze()"
    [unknownWords]="unknownWords()"
    (translate)="requests = requests + 1"
    (analyzeGrammar)="analyses = analyses + 1"
  />`,
})
class HostComponent {
  readonly aids = signal<SentenceAids>(NO_AIDS);
  readonly canAnalyze = signal(true);
  readonly unknownWords = signal<readonly UnknownWord[]>([]);
  requests = 0;
  analyses = 0;
}

describe('SentencePopoverComponent', () => {
  function render(aids: SentenceAids = NO_AIDS, canAnalyze = true) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.aids.set(aids);
    fixture.componentInstance.canAnalyze.set(canAnalyze);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof render>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The popover has more than one button now, so tests name the one they mean. */
  function translateButton(rendered: HTMLElement): HTMLButtonElement | undefined {
    return [...rendered.querySelectorAll('button')].find((button) =>
      /Translate this sentence|Try translating again/.test(button.textContent),
    );
  }

  it('shows a stored translation as English text', () => {
    const rendered = host(render(aidsWith({ translation: translation('The cat walked.') })));

    expect(rendered.querySelector('.translation')?.getAttribute('lang')).toBe('en');
    expect(rendered.textContent).toContain('The cat walked.');
    expect(translateButton(rendered)).toBeUndefined();
  });

  it('renders provider text as text, never as markup', () => {
    const rendered = host(
      render(aidsWith({ translation: translation('<script>alert(1)</script>The cat.') })),
    );

    expect(rendered.querySelector('script')).toBeNull();
    expect(rendered.querySelector('.translation')?.textContent).toContain(
      '<script>alert(1)</script>',
    );
  });

  it('offers the one action that spends a request, and says what it sends', () => {
    const fixture = render();
    const rendered = host(fixture);

    expect(rendered.textContent).toContain('Sends this one sentence to your text model');
    rendered.querySelector('button')?.click();

    expect(fixture.componentInstance.requests).toBe(1);
  });

  it('requests nothing merely by being opened', () => {
    // Opening a sentence is free: a stray press on a line must never cost a
    // request, so the component only ever asks when its button is pressed.
    const fixture = render();

    expect(fixture.componentInstance.requests).toBe(0);
  });

  it('reports a run in flight without offering a second one', () => {
    const rendered = host(
      render(aidsWith({ translationAction: { state: 'running', error: null } })),
    );

    expect(rendered.textContent).toContain('Translating…');
    expect(translateButton(rendered)).toBeUndefined();
  });

  it('turns a failure into a retry, worded by Monosai rather than the provider', () => {
    const rendered = host(
      render(
        aidsWith({
          translationAction: {
            state: 'failed',
            error: {
              source: 'provider',
              error: aiError('rate-limited', 'translation', 'raw provider text'),
            },
          },
        }),
      ),
    );

    expect(rendered.querySelector('button')?.textContent).toContain('Try translating again');
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain(
      'raw provider text',
    );
  });

  it('names the grammar a marked sentence was marked for', () => {
    // The gesture learners actually make is pressing the sentence, so the notes
    // its underline refers to have to be readable from here too.
    const rendered = host(render(aidsWith({ grammar: analysis(false), concernCount: 1 })));

    expect(rendered.textContent).toContain('Grammar');
    expect(rendered.textContent).toContain('である copula');
    expect(rendered.textContent).toContain('Each note is also on the word it is about.');
  });

  it('leaves grammar the learner already knows to the word', () => {
    // In-profile notes under every sentence are what buried the Japanese.
    const rendered = host(render(aidsWith({ grammar: analysis(true) })));

    expect(rendered.textContent).not.toContain('Each note is also on the word');
    expect(rendered.textContent).not.toContain('である copula');
  });

  it('offers grammar analysis here, and says what it sends', () => {
    const fixture = render();
    const rendered = host(fixture);
    const analyze = [...rendered.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Analyze grammar'),
    );

    analyze?.click();

    expect(fixture.componentInstance.analyses).toBe(1);
    expect(rendered.textContent).toContain('Sends this one sentence to your text model');
  });

  it('never offers analysis for a generated story', () => {
    // It was reviewed against the profile captured with it, and re-analysing it
    // would judge frozen text by a profile it was never written for.
    const rendered = host(render(NO_AIDS, false));

    expect(rendered.textContent).not.toContain('Analyze grammar');
  });

  it('offers re-analysis only while an analysis is stale', () => {
    const current = host(render(aidsWith({ grammar: analysis(false) })));
    expect(current.textContent).not.toContain('Re-analyze grammar');

    const stale = host(render(aidsWith({ grammar: analysis(false), grammarStale: true })));
    expect(stale.textContent).toContain('Re-analyze grammar');
  });

  it('keeps a failed analysis retryable, in Monosai wording', () => {
    const rendered = host(
      render(
        aidsWith({
          grammarAction: {
            state: 'failed',
            error: {
              source: 'provider',
              error: aiError('rate-limited', 'grammar-review', 'raw text'),
            },
          },
        }),
      ),
    );

    expect(rendered.textContent).toContain('Try analyzing again');
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain('raw text');
  });

  it('names the words the sentence was underlined for', () => {
    // The counterpart of the grammar note: a learner who pressed the sentence
    // because something was underlined finds out what, without hunting for it.
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.unknownWords.set([
      { surface: '猫', label: 'Unknown vocabulary' },
      { surface: '歩いた', label: 'Not in current vocabulary' },
    ]);
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;

    expect(rendered.textContent).toContain('Words you may not know');
    expect(rendered.querySelectorAll('.words li')).toHaveLength(2);
    expect(rendered.querySelector('.words .surface')?.getAttribute('lang')).toBe('ja');
    expect(rendered.textContent).toContain('Not in current vocabulary');
  });

  it('says nothing about vocabulary when every word is covered', () => {
    const rendered = host(render());

    expect(rendered.textContent).not.toContain('Words you may not know');
  });
});
