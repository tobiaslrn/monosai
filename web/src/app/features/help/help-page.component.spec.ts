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

  it('says in a short lead what Monosai is for and where to start, then offers the topics', () => {
    const element = render();
    const lead = element.querySelector('p[mn-lead]');
    expect(lead?.textContent).toContain('words you already know');
    expect(lead?.querySelector('a')?.getAttribute('href')).toBe('/help/get-started');
    expect([...element.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'Topics',
    ]);
    const order = lead?.compareDocumentPosition(
      element.querySelector('[data-testid="help-topic"]')!,
    );
    expect(order! & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
