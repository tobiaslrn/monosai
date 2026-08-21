import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { storageError } from '../../domain/storage/storage-error';
import { AudioProgressComponent } from './audio-progress.component';

function counts(completed: number, requested: number) {
  return { total: requested, requested, completed, failed: 0 };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AudioProgressComponent],
  template: `<mn-audio-progress
    [progress]="progress()"
    (cancelled)="cancels = cancels + 1"
    (retried)="retries = retries + 1"
    (dismissed)="dismissals = dismissals + 1"
  />`,
})
class HostComponent {
  readonly progress = signal<AudioJobProgress>({ kind: 'idle' });
  cancels = 0;
  retries = 0;
  dismissals = 0;
}

describe('AudioProgressComponent', () => {
  function render(progress: AudioJobProgress = { kind: 'idle' }) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.progress.set(progress);
    fixture.detectChanges();
    return fixture;
  }

  function press(element: HTMLElement, label: string): void {
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes(label))
      ?.click();
  }

  it('takes none of the screen while nothing is running', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.job')).toBeNull();
  });

  it('reports how far a run has got', () => {
    const element = render({ kind: 'running', counts: counts(2, 8) }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Reading 3 of 8…');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
  });

  it('offers a stop while it is running, and no retry', () => {
    const fixture = render({ kind: 'running', counts: counts(2, 8) });
    const element = fixture.nativeElement as HTMLElement;

    press(element, 'Stop');

    expect(fixture.componentInstance.cancels).toBe(1);
    expect(element.textContent).not.toContain('Retry');
  });

  /**
   * Audio stops at the sentence that failed rather than carrying on past it,
   * so the wording names that sentence: it is where a retry picks up, and the
   * whole-reading player stays shut until the set is finished.
   */
  it('names the sentence a failed run stopped at', () => {
    const element = render({
      kind: 'failed',
      counts: counts(4, 9),
      error: {
        source: 'provider',
        error: aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'),
      },
    }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Stopped at sentence 5 of 9');
    expect(element.textContent).toContain('Earlier clips were kept.');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'reading this sentence aloud',
    );
  });

  it('offers a retry after a failure that left clips missing', () => {
    const fixture = render({
      kind: 'failed',
      counts: counts(4, 9),
      error: {
        source: 'provider',
        error: aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'),
      },
    });

    press(fixture.nativeElement as HTMLElement, 'Retry');

    expect(fixture.componentInstance.retries).toBe(1);
  });

  it('offers no retry once every requested clip exists', () => {
    const element = render({ kind: 'complete', counts: counts(9, 9) }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Audio is ready for the whole reading.');
    expect(element.textContent).not.toContain('Retry');
  });

  it('says that a stopped run kept what it had produced', () => {
    const element = render({
      kind: 'cancelled',
      counts: counts(3, 9),
    }).nativeElement as HTMLElement;

    expect(element.textContent).toContain('Sentences already read aloud were kept.');
  });

  it('reports a storage failure as a saving problem, not a provider one', () => {
    const element = render({
      kind: 'failed',
      counts: counts(1, 4),
      error: { source: 'storage', error: storageError('quota', 'The disk was full.') },
    }).nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Saving failed: The disk was full.',
    );
  });

  it('can be dismissed once it has settled', () => {
    const fixture = render({ kind: 'complete', counts: counts(9, 9) });

    press(fixture.nativeElement as HTMLElement, 'Dismiss');

    expect(fixture.componentInstance.dismissals).toBe(1);
  });
});
