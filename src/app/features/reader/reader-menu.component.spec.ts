import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { ReaderMenuComponent } from './reader-menu.component';

function reading(completed: number, total: number, audioCompleted = 0): Reading {
  return {
    id: readingId('r1'),
    kind: 'imported',
    title: '第一章',
    createdAt: 1,
    updatedAt: 1,
    sentenceCount: total,
    lastOpenedAt: null,
    characterCount: 100,
    excerpt: '本文です。',
    translationSummary: { total, completed, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total, completed: audioCompleted, failed: 0 },
    analyzerVersion: 'analyzer/1',
    importSource: 'paste',
    sourceTextHash: 'hash-0',
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderMenuComponent],
  template: `<mn-reader-menu
    [reading]="reading()"
    [isRunning]="running()"
    [audioRunning]="audioRunning()"
    [canPlayAudio]="canPlayAudio()"
    (translateAll)="translateAlls = translateAlls + 1"
    (cancelled)="cancels = cancels + 1"
    (prepareAudio)="prepares = prepares + 1"
    (cancelAudio)="audioCancels = audioCancels + 1"
    (playReading)="plays = plays + 1"
    (deleteRequested)="deletes = deletes + 1"
  />`,
})
class HostComponent {
  readonly reading = signal<Reading>(reading(0, 4));
  readonly running = signal(false);
  readonly audioRunning = signal(false);
  readonly canPlayAudio = signal(false);
  translateAlls = 0;
  cancels = 0;
  prepares = 0;
  audioCancels = 0;
  plays = 0;
  deletes = 0;
}

describe('ReaderMenuComponent', () => {
  /**
   * The panel is a native popover, which jsdom does not implement. Dismissal
   * itself is the platform's; what is asserted here is that the component asks
   * for it, and jsdom is given the method to record the request.
   */
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.panel');
    const dismissals: number[] = [];
    Object.defineProperty(panel, 'hidePopover', {
      configurable: true,
      value: () => dismissals.push(1),
    });
    return { fixture, element: fixture.nativeElement as HTMLElement, dismissals };
  }

  /** Presses the panel entry whose label contains `label`. */
  function press(element: HTMLElement, label: string): void {
    [...element.querySelectorAll<HTMLButtonElement>('.panel button')]
      .find((button) => button.textContent.includes(label))
      ?.click();
  }

  it('is opened by the platform, from the button it is anchored to', () => {
    const { element } = render();
    const button = element.querySelector('.icon-button');

    expect(button?.getAttribute('popovertarget')).toBe('mn-reader-menu-panel');
    expect(element.querySelector('.panel')?.id).toBe('mn-reader-menu-panel');
    expect(element.querySelector('.panel')?.hasAttribute('popover')).toBe(true);
  });

  it('says how many sentences a whole-reading translation would send', () => {
    const { element } = render();

    expect(element.textContent).toContain('Translate 4 sentences');
    expect(element.textContent).toContain('Sends every untranslated sentence to your text model.');
  });

  it('offers nothing to translate once every sentence is translated', () => {
    const { fixture, element } = render();
    fixture.componentInstance.reading.set(reading(4, 4));
    fixture.detectChanges();

    expect(element.textContent).toContain('Every sentence is translated.');
    expect(element.textContent).not.toContain('Translate 0 sentences');
  });

  it('becomes a way to stop while a job runs', () => {
    const { fixture, element } = render();
    fixture.componentInstance.running.set(true);
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.panel button')?.click();

    expect(fixture.componentInstance.cancels).toBe(1);
    expect(fixture.componentInstance.translateAlls).toBe(0);
  });

  it('closes as soon as an entry is chosen', () => {
    const { fixture, element, dismissals } = render();

    element.querySelector<HTMLButtonElement>('.panel button')?.click();

    expect(fixture.componentInstance.translateAlls).toBe(1);
    expect(dismissals).toHaveLength(1);
  });

  describe('audio', () => {
    /** Preparing audio spends money per sentence, so it says how much. */
    it('says how many sentences preparing audio would send', () => {
      const { element } = render();

      expect(element.textContent).toContain('Prepare audio for 4 sentences');
      expect(element.textContent).toContain(
        'Sends every sentence without audio to your speech model.',
      );
    });

    it('names the last sentence singly rather than as a count of one', () => {
      const { fixture, element } = render();
      fixture.componentInstance.reading.set(reading(0, 4, 3));
      fixture.detectChanges();

      expect(element.textContent).toContain('Prepare audio for the last sentence');
    });

    it('offers nothing to prepare once every sentence has a clip', () => {
      const { fixture, element } = render();
      fixture.componentInstance.reading.set(reading(0, 4, 4));
      fixture.detectChanges();

      expect(element.textContent).not.toContain('Prepare audio');
    });

    it('becomes a way to stop while a run is going', () => {
      const { fixture, element } = render();
      fixture.componentInstance.audioRunning.set(true);
      fixture.detectChanges();

      press(element, 'Stop preparing audio');

      expect(fixture.componentInstance.audioCancels).toBe(1);
      expect(fixture.componentInstance.prepares).toBe(0);
    });

    it('starts a whole-reading run when the entry is chosen', () => {
      const { fixture, element } = render();

      press(element, 'Prepare audio for 4 sentences');

      expect(fixture.componentInstance.prepares).toBe(1);
    });

    /**
     * The complete-set gate. A player that stopped in the middle of a reading
     * would be worse than no player, so the entry does not exist until every
     * sentence has a clip under the current voice (ADR 0024).
     */
    it('hides Play reading while the set is incomplete', () => {
      const { element } = render();

      expect(element.textContent).not.toContain('Play reading');
    });

    it('offers Play reading once the gate is open', () => {
      const { fixture, element } = render();
      fixture.componentInstance.canPlayAudio.set(true);
      fixture.detectChanges();

      press(element, 'Play reading');

      expect(fixture.componentInstance.plays).toBe(1);
    });
  });

  it('asks for deletion rather than performing it', () => {
    const { fixture, element } = render();
    const remove = [...element.querySelectorAll<HTMLButtonElement>('.panel button')].at(-1);

    remove?.click();

    expect(fixture.componentInstance.deletes).toBe(1);
  });
});
