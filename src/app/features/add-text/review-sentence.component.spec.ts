import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { DraftSentence } from '../../domain/reading/import-draft';
import {
  ReviewSentenceComponent,
  type SentenceMergeRequest,
  type SentenceSplitRequest,
} from './review-sentence.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReviewSentenceComponent],
  template: `
    <mn-review-sentence
      [sentence]="sentence()"
      [index]="index()"
      [total]="total()"
      (split)="splits.push($event)"
      (merge)="merges.push($event)"
    />
  `,
})
class HostComponent {
  readonly sentence = signal<DraftSentence>({
    id: 's1',
    text: '猫が寝た。',
    tokens: [],
  });
  readonly index = signal(1);
  readonly total = signal(3);
  readonly splits: SentenceSplitRequest[] = [];
  readonly merges: SentenceMergeRequest[] = [];
}

describe('ReviewSentenceComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ReturnType<typeof render>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function openMenu(fixture: ReturnType<typeof render>): void {
    element(fixture).querySelector<HTMLButtonElement>('.toggle')?.click();
    fixture.detectChanges();
  }

  it('shows the sentence in a read-only field with an accessible name', () => {
    const text = element(render()).querySelector('textarea');

    expect(text?.value).toBe('猫が寝た。');
    expect(text?.readOnly).toBe(true);
    expect(text?.getAttribute('aria-label')).toBe('Sentence 2');
  });

  it('exposes the actions menu as a collapsed disclosure', () => {
    const fixture = render();
    const toggle = element(fixture).querySelector('.toggle');

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('Actions for sentence 2');
    expect(element(fixture).querySelector('.menu')).toBeNull();
  });

  it('opens the menu with all three boundary actions', () => {
    const fixture = render();
    openMenu(fixture);

    const labels = [...element(fixture).querySelectorAll('.menu button')].map((button) =>
      button.textContent.trim(),
    );
    expect(labels).toEqual(['Split at cursor', 'Merge with previous', 'Merge with next']);
    expect(element(fixture).querySelector('.toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('splits at the caret position', () => {
    const fixture = render();
    const text = element(fixture).querySelector('textarea');
    text!.setSelectionRange(3, 3);
    openMenu(fixture);

    element(fixture).querySelectorAll<HTMLButtonElement>('.menu button')[0].click();

    expect(fixture.componentInstance.splits).toEqual([{ sentenceId: 's1', offsetUtf16: 3 }]);
  });

  it('splits from the keyboard without leaving the text', () => {
    const fixture = render();
    const text = element(fixture).querySelector('textarea');
    text!.setSelectionRange(2, 2);

    text!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );

    expect(fixture.componentInstance.splits).toEqual([{ sentenceId: 's1', offsetUtf16: 2 }]);
  });

  it('emits merge requests in both directions', () => {
    const fixture = render();
    openMenu(fixture);
    const buttons = element(fixture).querySelectorAll<HTMLButtonElement>('.menu button');

    buttons[1].click();
    fixture.detectChanges();
    openMenu(fixture);
    element(fixture).querySelectorAll<HTMLButtonElement>('.menu button')[2].click();

    expect(fixture.componentInstance.merges).toEqual([
      { sentenceId: 's1', direction: 'previous' },
      { sentenceId: 's1', direction: 'next' },
    ]);
  });

  it('disables merging past the edges of a paragraph', () => {
    const fixture = render();
    fixture.componentInstance.index.set(0);
    fixture.componentInstance.total.set(1);
    fixture.detectChanges();
    openMenu(fixture);

    const buttons = element(fixture).querySelectorAll<HTMLButtonElement>('.menu button');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(true);
  });

  it('returns focus to the toggle after choosing an action', () => {
    const fixture = render();
    openMenu(fixture);
    element(fixture).querySelectorAll<HTMLButtonElement>('.menu button')[0].click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(element(fixture).querySelector('.toggle'));
    expect(element(fixture).querySelector('.menu')).toBeNull();
  });

  it('closes the menu on outside pointer input without swallowing the target', () => {
    const fixture = render();
    openMenu(fixture);
    const outside = document.createElement('button');
    document.body.append(outside);

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(element(fixture).querySelector('.menu')).toBeNull();
    outside.remove();
  });

  it('closes the menu on Escape and returns focus to its toggle', () => {
    const fixture = render();
    openMenu(fixture);
    const menuItem = element(fixture).querySelector<HTMLButtonElement>('.menu button');

    menuItem?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(element(fixture).querySelector('.menu')).toBeNull();
    expect(document.activeElement).toBe(element(fixture).querySelector('.toggle'));
  });

  it('marks a sentence that is still awaiting analysis', () => {
    const fixture = render();
    fixture.componentInstance.sentence.set({ id: 's1', text: '猫が寝た。', tokens: null });
    fixture.detectChanges();

    expect(element(fixture).querySelector('.row')?.classList.contains('is-pending')).toBe(true);
  });
});
