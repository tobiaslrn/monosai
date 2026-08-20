import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { ReaderMenuComponent } from './reader-menu.component';

function reading(completed: number, total: number): Reading {
  return {
    id: readingId('r1'),
    kind: 'imported',
    title: '第一章',
    createdAt: 1,
    updatedAt: 1,
    sentenceCount: total,
    lastOpenedAt: null,
    characterCount: 100,
    translationSummary: { total, completed, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total, completed: 0, failed: 0 },
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
    (translateAll)="translateAlls = translateAlls + 1"
    (cancelled)="cancels = cancels + 1"
    (deleteRequested)="deletes = deletes + 1"
  />`,
})
class HostComponent {
  readonly reading = signal<Reading>(reading(0, 4));
  readonly running = signal(false);
  translateAlls = 0;
  cancels = 0;
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

  it('asks for deletion rather than performing it', () => {
    const { fixture, element } = render();
    const remove = [...element.querySelectorAll<HTMLButtonElement>('.panel button')].at(-1);

    remove?.click();

    expect(fixture.componentInstance.deletes).toBe(1);
  });
});
