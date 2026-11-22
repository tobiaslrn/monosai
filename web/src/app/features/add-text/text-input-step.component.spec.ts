import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportStore } from '../../application/reading/import.store';
import { MAXIMUM_IMPORT_CHARACTERS } from '../../domain/reading/import-text';
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
  let store: FakeImportStore;

  beforeEach(() => {
    store = new FakeImportStore();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ImportStore, useValue: store }],
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

  it('keeps the textarea labelled, with neither hint nor counter while far from the limit', () => {
    const element = render();
    const textarea = element.querySelector('textarea');

    expect(element.querySelector('label[for="mn-import-text"]')?.textContent).toContain(
      'Japanese text',
    );
    // The label says what to paste, so there is no hint to repeat it.
    expect(element.querySelector('#mn-import-count')).toBeNull();
    expect(element.querySelector('#mn-import-hint')).toBeNull();
    expect(textarea?.getAttribute('aria-describedby')).toBeNull();
  });

  /** Every counter keeps out of the way until its field is roughly 80% full. */
  it('shows the counter from 80% of the limit, and only then names it as a description', () => {
    const threshold = Math.ceil(MAXIMUM_IMPORT_CHARACTERS * 0.8);

    store.setPastedText('あ'.repeat(threshold - 1));
    let element = render();
    expect(element.querySelector('#mn-import-count')).toBeNull();
    expect(element.querySelector('textarea')?.getAttribute('aria-describedby')).toBeNull();

    store.setPastedText('あ'.repeat(threshold));
    element = render();
    expect(element.querySelector('#mn-import-count')?.textContent).toContain(
      '40,000 of 50,000 characters',
    );
    expect(element.querySelector('textarea')?.getAttribute('aria-describedby')).toBe(
      'mn-import-count',
    );
  });

  it('says the count and the fix in one alert once the text is over the limit', () => {
    store.setPastedText('あ'.repeat(MAXIMUM_IMPORT_CHARACTERS + 2));
    const element = render();

    const count = element.querySelectorAll('#mn-import-count');
    expect(count).toHaveLength(1);
    expect(count[0]?.getAttribute('role')).toBe('alert');
    expect(count[0]?.textContent).toContain('Remove 2 characters to continue.');
  });
});
