import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { HelpPageComponent } from './help-page.component';
import { HELP_TOPICS } from './help-topics';

/*
 * There is no test here that every topic has a route. `HELP_TOPIC_PAGES` in the
 * route table is keyed by the slug union, so a topic without a page is a
 * compile error. Importing the route table to assert it would also pull the
 * whole routed application into this spec's module graph, and with it into the
 * coverage report, where every lazy screen no test touches counts as uncovered.
 */
describe('HelpPageComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HelpPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('leads with what Monosai is for and where it stops being the answer', () => {
    const element = render();
    expect([...element.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'What Monosai does',
      'What it is not',
      'Topics',
      'When something fails',
    ]);
    const text = element.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('words you have already');
    expect(text).toContain('meant to be outgrown');
    expect(text).toContain('read things people wrote');
  });

  it('offers every topic as a row that leads to its page', () => {
    const element = render();
    const rows = [...element.querySelectorAll('a[data-testid="help-topic"]')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(
      HELP_TOPICS.map((topic) => `/help/${topic.slug}`),
    );
    for (const topic of HELP_TOPICS) {
      expect(element.textContent).toContain(topic.title);
      expect(element.textContent).toContain(topic.summary);
    }
  });
});
