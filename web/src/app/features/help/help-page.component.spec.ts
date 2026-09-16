import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { HelpPageComponent } from './help-page.component';

describe('HelpPageComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HelpPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * Two headings, then folds. The page is a good reference and a poor first
   * thing to read, so only the part a stranger needs in their first ten
   * seconds is open.
   */
  it('leads with the first five minutes and the cost boundary, and folds the reference', () => {
    const element = render();

    expect([...element.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'First five minutes',
      'What is free, and what needs your key',
    ]);
    expect(element.querySelectorAll('.first-steps > li')).toHaveLength(3);
    expect([...element.querySelectorAll('details')].map((fold) => fold.open)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect([...element.querySelectorAll('details > summary')].map((s) => s.textContent)).toEqual([
      'Reader basics',
      'Your words and your level',
      'AI models, cost, and failures',
      'Getting useful audio',
      'Practical tips',
    ]);
  });

  /** The boundary the application otherwise states only in passing. */
  it('enumerates what is local and free against what spends the key', () => {
    const text = render().textContent.replace(/\s+/gu, ' ');

    for (const phrase of [
      'Dictionary lookup',
      'reading them offline',
      'Writing a story with AI',
      'Grammar notes',
      'billed to your account',
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it('keeps the reference it folds, and links every path to the screen that does it', () => {
    const element = render();
    const text = element.textContent.replace(/\s+/gu, ' ');

    for (const phrase of [
      'OpenRouter bills your account directly',
      'structured output',
      'Very short stories can be rough',
      'length is a guideline',
      'Basic grammar patterns',
    ]) {
      expect(text).toContain(phrase);
    }
    const links = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(
      expect.arrayContaining([
        '/add',
        '/generate',
        '/settings',
        '/reading-level#words',
        '/reading-level#grammar',
      ]),
    );
  });

  /** One name per action, the same one the controls use. */
  it('names the two ways in exactly as the application names them', () => {
    const text = render().textContent.replace(/\s+/gu, ' ');

    expect(text).toContain('Paste Japanese text');
    expect(text).toContain('Write with AI');
    expect(text).not.toContain('Add text');
    expect(text).not.toContain('Bring your own text');
    expect(text).not.toContain('Generate a story');
  });
});
