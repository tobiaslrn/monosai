import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { adjacentHelpTopics, HELP_TOPICS } from './help-topics';
import { FirstStepsPageComponent } from './topics/first-steps-page.component';
import { InstallPageComponent } from './topics/install-page.component';
import { QuestionsPageComponent } from './topics/questions-page.component';
import { ReadingPageComponent } from './topics/reading-page.component';
import { TextModelsPageComponent } from './topics/text-models-page.component';
import { VoicePageComponent } from './topics/voice-page.component';
import { YourWordsPageComponent } from './topics/your-words-page.component';

/** Every topic, with the component that is meant to answer it. */
const TOPIC_PAGES: readonly (readonly [string, Type<unknown>])[] = [
  ['first-steps', FirstStepsPageComponent],
  ['your-words', YourWordsPageComponent],
  ['reading', ReadingPageComponent],
  ['text-models', TextModelsPageComponent],
  ['voice', VoicePageComponent],
  ['install', InstallPageComponent],
  ['questions', QuestionsPageComponent],
];

function render(component: Type<unknown>): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('help topics', () => {
  it('has one page per declared topic, in the declared order', () => {
    expect(TOPIC_PAGES.map(([slug]) => slug)).toEqual(HELP_TOPICS.map((topic) => topic.slug));
  });

  it('names the neighbours of a topic, and the ends of the guide', () => {
    expect(adjacentHelpTopics('first-steps').previous).toBeNull();
    expect(adjacentHelpTopics('first-steps').next?.slug).toBe('your-words');
    expect(adjacentHelpTopics('questions').next).toBeNull();
    expect(adjacentHelpTopics('nothing-like-this')).toEqual({ previous: null, next: null });
  });

  describe.each(TOPIC_PAGES)('%s', (slug, component) => {
    const topic = HELP_TOPICS.find((candidate) => candidate.slug === slug);

    it('wears the topic title, a way back to Help, and a lead', () => {
      const element = render(component);
      expect(element.querySelector('h1')?.textContent).toBe(topic?.title);
      expect(element.querySelector('a[aria-label="Back to Help"]')?.getAttribute('href')).toBe(
        '/help',
      );
      expect(element.querySelector('.mn-prose__lead')?.textContent.trim()).toBeTruthy();
      expect(element.querySelectorAll('h2').length).toBeGreaterThan(0);
    });

    it('offers the way on to the adjacent topics', () => {
      const element = render(component);
      const onward = element.querySelector('nav[aria-label="More topics"]');
      const links = [...(onward?.querySelectorAll('a') ?? [])].map((link) =>
        link.getAttribute('href'),
      );
      expect(onward).not.toBeNull();
      const { previous, next } = adjacentHelpTopics(slug);
      expect(links).toEqual(
        [previous, next]
          .filter((neighbour) => neighbour !== null)
          .map((neighbour) => `/help/${neighbour.slug}`),
      );
    });
  });
});

describe('help topic content', () => {
  it('names the models it recommends with the exact ids OpenRouter uses', () => {
    const text = render(TextModelsPageComponent).textContent.replace(/\s+/g, ' ');
    expect(text).toContain('google/gemini-3.8-flash');
    expect(text).toContain('z-ai/glm-5.3-flash');
    expect(text).toContain('checked on');
  });

  it('contrasts the two kinds of speech model and what each one costs', () => {
    const text = render(VoicePageComponent).textContent.replace(/\s+/g, ' ');
    expect(text).toContain('google/gemini-3.1-flash-tts-preview');
    expect(text).toContain('hexgrad/kokoro-82m');
    expect(text).toContain('Around 20 cents');
    expect(text).toContain('Well under a cent');
  });

  it('explains why live Anki access on Android needs a second application', () => {
    const text = render(YourWordsPageComponent).textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Why it has to be a second app');
    expect(text).toContain('Play Protect');
    expect(text).toContain('read and write access');
    expect(text).toContain('webCorsOriginList');
  });

  it('keeps an empty balance apart from a rejected key, which no re-save can fix', () => {
    const text = render(QuestionsPageComponent).textContent.replace(/\s+/g, ' ');
    expect(text).toContain('ai/credit-exhausted');
    expect(text).toContain('Saving the key again will not help');
    expect(text).toContain('ai/authentication');
  });

  it('says where the data is and what leaves the device', () => {
    const text = render(InstallPageComponent).textContent.replace(/\s+/g, ' ');
    expect(text).toContain('no account and no server');
    expect(text).toContain('collects no analytics');
  });
});
