import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_AIDS, type SentenceAids } from '../../application/enrichment/sentence-aids.store';
import { aiError } from '../../domain/ai/ai-error';
import type {
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../domain/enrichment/records';
import { assetId, readingId, sentenceId } from '../../domain/shared/ids';
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

function clip(): AudioAssetSummary {
  return {
    id: assetId('a-1'),
    sentenceId: SENTENCE_ID,
    readingId: readingId('r1'),
    sourceContentHash: 'hash-0',
    modelId: 'vendor/tts',
    voiceId: 'voice-a',
    optionsFingerprint: 'options-fp',
    mimeType: 'audio/mpeg',
    byteLength: 512,
    cacheKey: 'key-a1',
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
    [sentenceText]="sentenceText()"
    [canAnalyze]="canAnalyze()"
    [translationModelConfigured]="translationModelConfigured()"
    [grammarModelConfigured]="grammarModelConfigured()"
    [unknownWords]="unknownWords()"
    (translate)="requests = requests + 1"
    (analyzeGrammar)="analyses = analyses + 1"
    (generateAudio)="syntheses = syntheses + 1"
    (playAudio)="plays = plays + 1"
  />`,
})
class HostComponent {
  readonly aids = signal<SentenceAids>(NO_AIDS);
  readonly sentenceText = signal('猫が寝た。');
  readonly canAnalyze = signal(true);
  readonly translationModelConfigured = signal(true);
  readonly grammarModelConfigured = signal(true);
  readonly unknownWords = signal<readonly UnknownWord[]>([]);
  requests = 0;
  analyses = 0;
  syntheses = 0;
  plays = 0;
}

describe('SentencePopoverComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

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
      /^Translate( again)?$/.test(button.textContent.trim()),
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

  /**
   * Labels only. What an AI action sends is a property of the application, said
   * once in Settings; repeating it under three buttons is what made pressing a
   * sentence feel expensive.
   */
  it('offers the action as a label, with nothing written under it', () => {
    const fixture = render();
    const rendered = host(fixture);

    expect(rendered.textContent).not.toContain('Sends this one sentence');
    translateButton(rendered)?.click();

    expect(fixture.componentInstance.requests).toBe(1);
  });

  it('requests nothing merely by being opened', () => {
    // Opening a sentence is free: a stray press on a line must never cost a
    // request, so the component only ever asks when its button is pressed.
    const fixture = render();

    expect(fixture.componentInstance.requests).toBe(0);
  });

  it('copies the immutable Japanese sentence and reports success on the action', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = render();
    const rendered = host(fixture);

    [...rendered.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Copy')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('猫が寝た。');
    expect(rendered.textContent).toContain('Copied');
    expect(rendered.querySelector('[role="status"]')?.textContent).toContain('Sentence copied.');
  });

  it('keeps copy failures local and offers ordinary selection as recovery', async () => {
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('private platform detail')) },
    });
    const fixture = render();
    const rendered = host(fixture);

    [...rendered.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Copy')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = rendered.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('select it in the reader and copy it instead');
    expect(alert?.textContent).not.toContain('private platform detail');
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

    expect(translateButton(rendered)?.textContent).toContain('Translate again');
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain(
      'raw provider text',
    );
  });

  /**
   * 11.2/24.1: the shared table's settings wording used to reach this popover,
   * which told the learner to run a test this screen does not have.
   */
  it('offers the retry beside it rather than a settings test', () => {
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
    const alert = rendered.querySelector('[role="alert"]')?.textContent ?? '';

    expect(alert).toContain('while translating this sentence');
    expect(alert).toContain('Wait a moment, then try again.');
    expect(alert.toLowerCase()).not.toContain('test');
    expect(translateButton(rendered)).toBeDefined();
  });

  it('sends an exhausted account to add credit, not back to a working key', () => {
    const rendered = host(
      render(
        aidsWith({
          translationAction: {
            state: 'failed',
            error: {
              source: 'provider',
              error: aiError('credit-exhausted', 'translation', 'Payment Required'),
            },
          },
        }),
      ),
    );
    const alert = rendered.querySelector('[role="alert"]')?.textContent ?? '';

    expect(alert).toContain('out of credit');
    expect(alert).toContain('Add credit on openrouter.ai');
    expect(alert.toLowerCase()).not.toContain('save it again');
    expect(translateButton(rendered)?.textContent).toContain('Translate again');
  });

  it('offers Settings when translation has no configured model', () => {
    const fixture = render(
      aidsWith({
        translationAction: {
          state: 'failed',
          error: {
            source: 'provider',
            error: aiError('capability-unsupported', 'translation', 'No model is configured.'),
          },
        },
      }),
    );
    fixture.componentInstance.translationModelConfigured.set(false);
    fixture.detectChanges();

    const rendered = host(fixture);
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      'No translation model is configured',
    );
    expect(rendered.querySelector('a[routerlink="/settings"]')?.textContent).toContain(
      'Open Settings',
    );
    expect(rendered.textContent).not.toContain('Choose a different model');
  });

  it('names the grammar a marked sentence was marked for', () => {
    // The gesture learners actually make is pressing the sentence, so the notes
    // its underline refers to have to be readable from here too.
    const rendered = host(render(aidsWith({ grammar: analysis(false), concernCount: 1 })));

    expect(rendered.textContent).toContain('Grammar');
    expect(rendered.textContent).toContain('である copula');
  });

  it('leaves grammar the learner already knows to the word', () => {
    // In-profile notes under every sentence are what buried the Japanese.
    const rendered = host(render(aidsWith({ grammar: analysis(true) })));

    expect(rendered.querySelector('.grammar')).toBeNull();
    expect(rendered.textContent).not.toContain('である copula');
  });

  it('offers grammar analysis here', () => {
    const fixture = render();
    const rendered = host(fixture);
    const analyze = [...rendered.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Grammar',
    );

    analyze?.click();

    expect(fixture.componentInstance.analyses).toBe(1);
  });

  it('never offers analysis for a generated story', () => {
    // It was reviewed against the profile captured with it, and re-analysing it
    // would judge frozen text by a profile it was never written for.
    const rendered = host(render(NO_AIDS, false));

    expect(
      [...rendered.querySelectorAll('.actions button')].map((button) => button.textContent.trim()),
    ).not.toContain('Grammar');
  });

  it('offers re-analysis only while an analysis is stale', () => {
    const current = host(render(aidsWith({ grammar: analysis(false) })));
    expect(current.textContent).not.toContain('Grammar again');

    const stale = host(render(aidsWith({ grammar: analysis(false), grammarStale: true })));
    expect(stale.textContent).toContain('Grammar again');
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

    expect(rendered.textContent).toContain('Grammar again');
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain('raw text');
  });

  it('offers Settings when grammar has no configured model', () => {
    const fixture = render(
      aidsWith({
        grammarAction: {
          state: 'failed',
          error: {
            source: 'provider',
            error: aiError('capability-unsupported', 'grammar-review', 'No model is configured.'),
          },
        },
      }),
    );
    fixture.componentInstance.grammarModelConfigured.set(false);
    fixture.detectChanges();

    const rendered = host(fixture);
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      'No grammar model is configured',
    );
    expect(rendered.querySelectorAll('a[routerlink="/settings"]')).toHaveLength(1);
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

  /**
   * The only route to audio for one sentence. No play control is printed on the
   * reading surface itself, so pressing a sentence still costs nothing.
   */
  describe('audio', () => {
    function audioButton(rendered: HTMLElement, label: string): HTMLButtonElement | undefined {
      return [...rendered.querySelectorAll('button')].find((button) =>
        button.textContent.includes(label),
      );
    }

    it('offers to generate audio, as a label and nothing more', () => {
      const fixture = render();
      const rendered = host(fixture);

      expect(rendered.textContent).not.toContain('speech model');
      audioButton(rendered, 'Audio')?.click();

      expect(fixture.componentInstance.syntheses).toBe(1);
    });

    /** Producing a clip is not hearing it: playing is a second explicit action. */
    it('offers to play, and never generates, once a clip exists', () => {
      const fixture = render(aidsWith({ audio: clip() }));
      const rendered = host(fixture);
      const labels = [...rendered.querySelectorAll('.actions button')].map((button) =>
        button.textContent.trim(),
      );

      expect(labels).toContain('Play');
      expect(labels).not.toContain('Audio');
      audioButton(rendered, 'Play')?.click();

      expect(fixture.componentInstance.plays).toBe(1);
      expect(fixture.componentInstance.syntheses).toBe(0);
    });

    it('reports that a clip is being produced, offering neither action', () => {
      const rendered = host(render(aidsWith({ audioAction: { state: 'running', error: null } })));

      const labels = [...rendered.querySelectorAll('.actions button')].map((button) =>
        button.textContent.trim(),
      );

      expect(rendered.textContent).toContain('Generating…');
      expect(labels).not.toContain('Audio');
      expect(labels).not.toContain('Play');
    });

    it('offers a retry, and says what went wrong, after a failure', () => {
      const rendered = host(
        render(
          aidsWith({
            audioAction: {
              state: 'failed',
              error: {
                source: 'provider',
                error: aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'),
              },
            },
          }),
        ),
      );

      expect(rendered.textContent).toContain('Audio again');
      expect(rendered.querySelector('[role="alert"]')).not.toBeNull();
    });
  });
});
