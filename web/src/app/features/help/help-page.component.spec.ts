import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { HelpPageComponent } from './help-page.component';

describe('HelpPageComponent', () => {
  it('teaches the starting paths, reader aids, and model limitations with local links', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HelpPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Start here',
      'Reader basics',
      'AI models, cost, and failures',
      'Getting useful audio',
      'Practical tips',
    ]);
    const text = element.textContent.replace(/\s+/g, ' ');
    for (const phrase of [
      'OpenRouter bills your account directly',
      'exact model IDs',
      'structured output',
      'Gemini TTS works by far the best in Monosai.',
      'Very short stories can be rough',
      'length is a guideline',
      'Basic grammar patterns',
    ]) {
      expect(text).toContain(phrase);
    }
    const links = [...element.querySelectorAll('a')].map((a) => a.getAttribute('href'));
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
});
