import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { TranslationJobProgress } from '../../application/enrichment/translation-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { TranslationProgressComponent } from './translation-progress.component';

function counts(completed: number, requested: number) {
  return { total: requested, requested, completed, failed: 0 };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslationProgressComponent],
  template: `<mn-translation-progress
    [progress]="progress()"
    (cancelled)="cancels = cancels + 1"
    (retried)="retries = retries + 1"
    (dismissed)="dismissals = dismissals + 1"
  />`,
})
class HostComponent {
  readonly progress = signal<TranslationJobProgress>({ kind: 'idle' });
  cancels = 0;
  retries = 0;
  dismissals = 0;
}

describe('TranslationProgressComponent', () => {
  function render(progress: TranslationJobProgress = { kind: 'idle' }) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.progress.set(progress);
    fixture.detectChanges();
    return fixture;
  }

  it('takes none of the screen while nothing is running', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.job')).toBeNull();
  });

  it('reports how far a run has got', () => {
    const element = render({ kind: 'running', counts: counts(2, 8) }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Translating 3 of 8…');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
  });

  it('offers a stop while it is running, and no retry', () => {
    const fixture = render({ kind: 'running', counts: counts(2, 8) });
    const element = fixture.nativeElement as HTMLElement;

    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes('Stop'))
      ?.click();

    expect(fixture.componentInstance.cancels).toBe(1);
    expect(element.textContent).not.toContain('Retry the rest');
  });

  it('promises that a stopped run kept what it already stored', () => {
    const element = render({ kind: 'cancelled', counts: counts(3, 8) })
      .nativeElement as HTMLElement;

    expect(element.textContent).toContain('Sentences already translated were kept.');
    expect(element.textContent).toContain('Retry the rest');
  });

  it('reports a failure in Monosai wording and keeps the retry', () => {
    const fixture = render({
      kind: 'failed',
      counts: counts(3, 8),
      error: { source: 'provider', error: aiError('rate-limited', 'translation', 'raw text') },
    });
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')?.textContent).not.toContain('raw text');
    expect(element.textContent).toContain('Nothing already translated was lost.');

    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes('Retry the rest'))
      ?.click();
    expect(fixture.componentInstance.retries).toBe(1);
  });

  it('offers no retry for a finished run', () => {
    const element = render({ kind: 'complete', counts: counts(8, 8) }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Translation finished.');
    expect(element.textContent).not.toContain('Retry the rest');
  });

  it('can be dismissed, so the reader returns to the text', () => {
    const fixture = render({ kind: 'complete', counts: counts(8, 8) });

    [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes('Dismiss'))
      ?.click();

    expect(fixture.componentInstance.dismissals).toBe(1);
  });
});
