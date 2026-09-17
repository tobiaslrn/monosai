import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../../core/routing/app.routes';
import { HelpPageComponent } from './help-page.component';
import { HELP_TOPICS } from './help-topics';

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
      'What Monosai is for',
      'And what it is not for',
      'Topics',
      'When something fails',
    ]);
    const text = element.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('words you have already');
    expect(text).toContain('meant to be outgrown');
    expect(text).toContain('material written by people');
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

  it('keeps a route for every topic, titled the way the shelf names it', () => {
    for (const topic of HELP_TOPICS) {
      const route = APP_ROUTES.find((candidate) => candidate.path === `help/${topic.slug}`);
      expect(route, `missing route for ${topic.slug}`).toBeDefined();
      expect(route?.title).toBe(`${topic.title} · Monosai`);
      expect(route?.loadComponent).toBeDefined();
    }
    const helpRoutes = APP_ROUTES.filter((route) => route.path?.startsWith('help/'));
    expect(helpRoutes).toHaveLength(HELP_TOPICS.length);
  });
});
