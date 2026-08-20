import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TranslationJobProgress } from '../../application/enrichment/translation-job.store';
import { aiError } from '../../domain/ai/ai-error';
import type { CompletionSummary } from '../../domain/reading/summaries';
import type { ImportedReading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { ReadingStatusPanelComponent } from './reading-status-panel.component';

function reading(translationSummary: CompletionSummary): ImportedReading {
  return {
    id: readingId('r1'),
    kind: 'imported',
    title: 'Imported',
    createdAt: 1,
    updatedAt: 1,
    sentenceCount: translationSummary.total,
    lastOpenedAt: null,
    characterCount: 100,
    translationSummary,
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: translationSummary.total, completed: 0, failed: 0 },
    analyzerVersion: 'a1',
    importSource: 'paste',
    sourceTextHash: 'hash',
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadingStatusPanelComponent],
  template: `
    <mn-reading-status-panel
      [reading]="current()"
      [progress]="progress()"
      (started)="events.push('started')"
      (cancelled)="events.push('cancelled')"
      (retried)="events.push('retried')"
    />
  `,
})
class HostComponent {
  readonly current = signal<ImportedReading>(reading({ total: 10, completed: 4, failed: 0 }));
  readonly progress = signal<TranslationJobProgress>({ kind: 'idle' });
  readonly events: string[] = [];
}

describe('ReadingStatusPanelComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function buttonNamed(element: HTMLElement, name: string): HTMLButtonElement | undefined {
    return [...element.querySelectorAll('button')].find((button) =>
      button.textContent.includes(name),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('reports how much of the reading is translated', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Translations: 4 of 10');
    expect(element.textContent).toContain('6 sentences have no translation yet.');
  });

  it('offers no start action when nothing is missing', () => {
    const fixture = render();
    fixture.componentInstance.current.set(reading({ total: 10, completed: 10, failed: 0 }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(buttonNamed(element, 'Translate whole reading')).toBeUndefined();
    expect(element.textContent).toContain('Every sentence is translated.');
  });

  it('starts the job on request', () => {
    const fixture = render();

    buttonNamed(fixture.nativeElement as HTMLElement, 'Translate whole reading')?.click();

    expect(fixture.componentInstance.events).toEqual(['started']);
  });

  it('replaces the start action with Cancel while the job runs', () => {
    const fixture = render();
    fixture.componentInstance.progress.set({
      kind: 'running',
      counts: { total: 10, requested: 6, completed: 2, failed: 0 },
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Translating 3 of 6…');
    expect(buttonNamed(element, 'Translate whole reading')).toBeUndefined();

    buttonNamed(element, 'Cancel')?.click();
    expect(fixture.componentInstance.events).toEqual(['cancelled']);
  });

  it('says what was kept after a cancellation, and offers to resume', () => {
    const fixture = render();
    fixture.componentInstance.progress.set({
      kind: 'cancelled',
      counts: { total: 10, requested: 6, completed: 2, failed: 0 },
    });
    fixture.componentInstance.current.set(reading({ total: 10, completed: 6, failed: 0 }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Sentences already translated were kept.');

    buttonNamed(element, 'Retry the rest')?.click();
    expect(fixture.componentInstance.events).toEqual(['retried']);
  });

  it('explains a provider failure in the shared wording, without provider text', () => {
    const fixture = render();
    fixture.componentInstance.progress.set({
      kind: 'failed',
      counts: { total: 10, requested: 6, completed: 2, failed: 1 },
      error: {
        source: 'provider',
        error: aiError('rate-limited', 'translation', 'HTTP 429 from upstream'),
      },
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('OpenRouter is rate limiting this key');
    expect(element.textContent).toContain('Nothing already translated was lost.');
    expect(element.textContent).not.toContain('HTTP 429');
  });
});
