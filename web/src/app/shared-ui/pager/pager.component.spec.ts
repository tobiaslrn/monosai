import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { PagerComponent } from './pager.component';

describe('PagerComponent', () => {
  function render(previous: boolean, next: boolean): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PagerComponent);
    fixture.componentRef.setInput('label', 'More topics');
    fixture.componentRef.setInput(
      'previous',
      previous ? { title: 'Your words', link: ['/help', 'your-words'], testId: 'prev' } : null,
    );
    fixture.componentRef.setInput(
      'next',
      next ? { title: 'Voice and audio', link: ['/help', 'voice'], testId: 'next' } : null,
    );
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names each side with an eyebrow over its title, linked to its page', () => {
    const element = render(true, true);
    const links = [...element.querySelectorAll('a')];
    expect(links.map((link) => link.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Previous Your words',
      'Next Voice and audio',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/help/your-words',
      '/help/voice',
    ]);
    expect(element.querySelector('[data-testid="prev"]')).toBe(links[0]);
    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('More topics');
  });

  it('draws only the side that exists', () => {
    expect(render(false, true).querySelectorAll('a')).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(render(true, false).querySelectorAll('a')).toHaveLength(1);
  });
});
