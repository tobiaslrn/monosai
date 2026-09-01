import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { InvalidDraft } from '../../application/generation/generation.store';
import { InvalidDraftComponent } from './invalid-draft.component';

const DRAFT: InvalidDraft = {
  titleJa: '図書館のねこ',
  titleUnknownSurfaces: ['図書館'],
  sentences: [
    { textJa: 'ねこがいます。', unknownSurfaces: [] },
    { textJa: 'ねこは図書館へいきます。', unknownSurfaces: ['図書館'] },
  ],
  issues: ['“図書館” is not in your reviewed vocabulary.'],
  repairAttempts: 2,
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InvalidDraftComponent],
  template: `<mn-invalid-draft
    [draft]="draft()"
    (tryAgain)="events.push('tryAgain')"
    (changePremise)="events.push('changePremise')"
    (closeRequested)="events.push('close')"
  />`,
})
class HostComponent {
  readonly draft = signal<InvalidDraft>(DRAFT);
  readonly events: string[] = [];
}

describe('InvalidDraftComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(draft: InvalidDraft = DRAFT): {
    readonly element: HTMLElement;
    readonly host: HostComponent;
  } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.draft.set(draft);
    fixture.detectChanges();
    return { element: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
  }

  it('shows the unsaved Japanese exactly as the model wrote it', () => {
    const { element } = render();

    const story = element.querySelector('[data-testid="invalid-draft-text"]');
    // The visible text only: the marker labels are for assistive technology.
    const visible = [...(story?.querySelectorAll('p') ?? [])].map((node) =>
      node.textContent.replaceAll(/\s*\(unknown vocabulary\)/g, '').trim(),
    );
    expect(visible).toEqual(['ねこがいます。', 'ねこは図書館へいきます。']);
    expect(story?.getAttribute('lang')).toBe('ja');
  });

  it('marks the words that kept it out, and only those', () => {
    const { element } = render();

    const marked = [...element.querySelectorAll('.unknown')].map((node) =>
      node.textContent.replace('(unknown vocabulary)', '').trim(),
    );
    // Once in the title and once in the sentence that contains it.
    expect(marked).toEqual(['図書館', '図書館']);
  });

  it('labels each marker for readers who cannot see the underline', () => {
    const { element } = render();

    expect(element.querySelector('.unknown .mn-visually-hidden')?.textContent).toContain(
      'unknown vocabulary',
    );
  });

  it('lists the issues and the repair-attempt count', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="invalid-draft-issues"]')?.textContent).toContain(
      '図書館',
    );
    expect(element.textContent).toContain('2 repair attempts');
  });

  it('states the unsaved result once before its useful detail', () => {
    const { element } = render();

    expect(element.querySelector('h2')?.textContent).toBe('This story was not saved');
    expect(element.textContent.match(/Nothing was added to your library\./g)).toHaveLength(1);
  });

  it('offers no way to save it anyway', () => {
    const { element } = render();

    const labels = [...element.querySelectorAll('button')].map((node) =>
      node.textContent.trim().toLowerCase(),
    );
    expect(labels).toEqual(['try a new generation', 'change premise or instructions', 'close']);
    expect(element.textContent.toLowerCase()).not.toContain('save anyway');
  });

  it('reports each action to its owner rather than acting itself', () => {
    const { element, host } = render();

    for (const testId of ['try-again', 'change-premise', 'close-draft']) {
      element.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
    }

    expect(host.events).toEqual(['tryAgain', 'changePremise', 'close']);
  });

  it('renders a draft whose title validated cleanly', () => {
    const { element } = render({ ...DRAFT, titleJa: 'ねこ', titleUnknownSurfaces: [] });

    expect(element.querySelector('h4')?.textContent.trim()).toBe('ねこ');
  });
});
