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
    (translateAll)="translateAlls = translateAlls + 1"
    (cancelled)="cancels = cancels + 1"
    (cancelAudioRequested)="audioCancels = audioCancels + 1"
    (deleteAudioRequested)="audioDeletes = audioDeletes + 1"
    (deleteRequested)="deletes = deletes + 1"
  />`,
})
class HostComponent {
  readonly reading = signal<Reading>(reading(0, 4));
  readonly running = signal(false);
  readonly audioRunning = signal(false);
  translateAlls = 0;
  cancels = 0;
  audioCancels = 0;
  audioDeletes = 0;
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
    const button = element.querySelector('.anchor-button');

    expect(button?.getAttribute('popovertarget')).toBe('mn-reader-menu-panel');
    expect(element.querySelector('.panel')?.id).toBe('mn-reader-menu-panel');
    expect(element.querySelector('.panel')?.hasAttribute('popover')).toBe(true);
  });

  /**
   * Labels only. The explanation of what an AI action sends is stated once, in
   * Settings, rather than under every button that could trigger one.
   */
  it('carries labels and no explanations', () => {
    const { element } = render();

    expect(element.textContent).toContain('Translate reading');
    expect(element.textContent).toContain('Delete reading');
    expect(element.textContent).not.toContain('Sends');
  });

  it('offers nothing to translate once every sentence is translated', () => {
    const { fixture, element } = render();
    fixture.componentInstance.reading.set(reading(4, 4));
    fixture.detectChanges();

    expect(element.textContent).not.toContain('Translate reading');
  });

  it('becomes a way to stop while a job runs', () => {
    const { fixture, element } = render();
    fixture.componentInstance.running.set(true);
    fixture.detectChanges();

    press(element, 'Stop translating');

    expect(fixture.componentInstance.cancels).toBe(1);
    expect(fixture.componentInstance.translateAlls).toBe(0);
  });

  it('closes as soon as an entry is chosen', () => {
    const { fixture, element, dismissals } = render();

    press(element, 'Translate reading');

    expect(fixture.componentInstance.translateAlls).toBe(1);
    expect(dismissals).toHaveLength(1);
  });

  it('offers audio deletion in the menu once this reading has generated audio', () => {
    const { fixture, element, dismissals } = render();
    fixture.componentInstance.reading.set(reading(0, 4, 2));
    fixture.detectChanges();

    press(element, 'Delete audio');

    expect(fixture.componentInstance.audioDeletes).toBe(1);
    expect(dismissals).toHaveLength(1);
  });

  it('offers audio deletion while generation is running, but not for a fresh reading', () => {
    const { fixture, element } = render();

    expect(element.textContent).not.toContain('Delete audio');

    fixture.componentInstance.audioRunning.set(true);
    fixture.detectChanges();
    expect(element.textContent).toContain('Delete audio');
  });

  /**
   * Stopping a run is a reading-level audio action, so it sits with the other
   * one rather than in the player. A permanent row in a card that floats over
   * the reading is a poor home for something pressed once a run, if ever.
   */
  it('offers to stop a run only while one is going', () => {
    const { fixture, element, dismissals } = render();

    expect(element.textContent).not.toContain('Stop generating audio');

    fixture.componentInstance.audioRunning.set(true);
    fixture.detectChanges();
    press(element, 'Stop generating audio');

    expect(fixture.componentInstance.audioCancels).toBe(1);
    expect(dismissals).toHaveLength(1);
  });

  it('asks for deletion rather than performing it', () => {
    const { fixture, element } = render();

    press(element, 'Delete reading');

    expect(fixture.componentInstance.deletes).toBe(1);
  });
});
