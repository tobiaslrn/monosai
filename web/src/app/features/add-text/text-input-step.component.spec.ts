import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportStore } from '../../application/reading/import.store';
import { TextInputStepComponent } from './text-input-step.component';

/** Only the surface this field group reads from the import store. */
class FakeImportStore {
  private text = '';

  rawText(): string {
    return this.text;
  }

  characterCount(): number {
    return this.text.length;
  }

  titleInput(): string {
    return '';
  }

  derivedTitle(): string {
    return '';
  }

  rejection(): null {
    return null;
  }

  advisories(): readonly [] {
    return [];
  }

  setPastedText(value: string): void {
    this.text = value;
  }

  setTitle(): void {
    // Not exercised here.
  }
}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(TextInputStepComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TextInputStepComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ImportStore, useValue: new FakeImportStore() }],
    });
  });

  /**
   * The field group carried `role="tabpanel"` left over from a stepper that no
   * longer exists. With no tablist and no tab anywhere on the page, a screen
   * reader announced "tab panel" over a plain textarea and offered a tab to
   * move to that was never there.
   */
  it('exposes no part of a tab pattern', () => {
    const element = render();

    expect(element.querySelector('[role="tabpanel"]')).toBeNull();
    expect(element.querySelector('[role="tab"]')).toBeNull();
    expect(element.querySelector('[role="tablist"]')).toBeNull();
  });

  it('stops the title input at the stored title limit', () => {
    const element = render();

    expect(element.querySelector('#mn-import-title')?.getAttribute('maxlength')).toBe('120');
  });

  it('keeps the textarea labelled, with a hint instead of a counter while far from the limit', () => {
    const element = render();
    const textarea = element.querySelector('textarea');

    expect(element.querySelector('label[for="mn-import-text"]')?.textContent).toContain(
      'Japanese text',
    );
    // The hint is the field's instruction, so the placeholder is not the only one.
    expect(element.querySelector('#mn-import-count')).toBeNull();
    expect(element.querySelector('#mn-import-hint')?.textContent).toContain('Paste or type');
    expect(textarea?.getAttribute('aria-describedby')).toBe('mn-import-hint');
  });
});
