import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { adjacentHelpTopics, HELP_TOPICS } from './help-topics';
import { GetStartedPageComponent } from './topics/get-started-page.component';
import { InstallPageComponent } from './topics/install-page.component';
import { PrivacyPageComponent } from './topics/privacy-page.component';
import { QuestionsPageComponent } from './topics/questions-page.component';
import { ReadingLevelHelpPageComponent } from './topics/reading-level-page.component';
import { ReadingPageComponent } from './topics/reading-page.component';
import { TextModelsPageComponent } from './topics/text-models-page.component';
import { TroubleshootingPageComponent } from './topics/troubleshooting-page.component';
import { VoicePageComponent } from './topics/voice-page.component';
import { WritePageComponent } from './topics/write-page.component';
import { YourWordsPageComponent } from './topics/your-words-page.component';

/** Every topic, with the component that is meant to answer it. */
const TOPIC_PAGES: readonly (readonly [string, Type<unknown>])[] = [
  ['get-started', GetStartedPageComponent],
  ['your-words', YourWordsPageComponent],
  ['reading-level', ReadingLevelHelpPageComponent],
  ['write', WritePageComponent],
  ['reading', ReadingPageComponent],
  ['text-models', TextModelsPageComponent],
  ['voice', VoicePageComponent],
  ['install', InstallPageComponent],
  ['privacy', PrivacyPageComponent],
  ['questions', QuestionsPageComponent],
  ['troubleshooting', TroubleshootingPageComponent],
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
    expect(adjacentHelpTopics('get-started').previous).toBeNull();
    expect(adjacentHelpTopics('get-started').next?.slug).toBe('your-words');
    expect(adjacentHelpTopics('troubleshooting').next).toBeNull();
    expect(adjacentHelpTopics('nothing-like-this')).toEqual({ previous: null, next: null });
  });

  describe.each(TOPIC_PAGES)('%s', (slug, component) => {
    const topic = HELP_TOPICS.find((candidate) => candidate.slug === slug);

    it('wears the topic title, a way back to Help, a lead, and sections', () => {
      const element = render(component);
      expect(element.querySelector('h1')?.textContent).toBe(topic?.title);
      expect(element.querySelector('p[mn-lead]')).not.toBeNull();
      expect(element.querySelector('a[aria-label="Back to Help"]')?.getAttribute('href')).toBe(
        '/help',
      );
      expect(element.querySelectorAll('h2').length).toBeGreaterThan(0);
    });

    it('offers the way on to the adjacent topics', () => {
      const element = render(component);
      const onward = element.querySelector('nav[aria-label="More topics"]');
      const links = [...(onward?.querySelectorAll('a[data-testid^="help-"]') ?? [])].map((link) =>
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
  const text = (component: Type<unknown>): string =>
    render(component).textContent.replace(/\s+/g, ' ');

  it('names the models it recommends with the exact ids OpenRouter uses', () => {
    const page = text(TextModelsPageComponent);
    expect(page).toContain('google/gemini-3.8-flash');
    expect(page).toContain('z-ai/glm-5.3-flash');
    expect(page).toContain('checked on');
  });

  it('contrasts the two kinds of speech model and what each one costs', () => {
    const page = text(VoicePageComponent);
    expect(page).toContain('google/gemini-3.1-flash-tts-preview');
    expect(page).toContain('hexgrad/kokoro-82m');
    expect(page).toContain('Around 20 cents');
    expect(page).toContain('Well under a cent');
  });

  it('names the voice test by the label the Voice page gives it', () => {
    const page = text(VoicePageComponent);
    expect(page).toContain('Play sample');
    expect(page).not.toMatch(/\bPreview (first|plays|before)/u);
  });

  it('warns that a dictionary-driven speech model fixes a kanji to one reading', () => {
    const page = text(VoicePageComponent);
    expect(page).toContain('When a word is read wrong');
    expect(page).toContain('私');
    expect(page).toContain('わたくし');
  });

  it('gives a word source for every device, iPhone included', () => {
    const page = text(YourWordsPageComponent);
    expect(page).toContain('AnkiMobile on iPhone or iPad');
    expect(page).toContain('Monosai Bridge');
    expect(page).toContain('read and write access');
    expect(page).toContain('webCorsOriginList');
  });

  /* The address to allow is whichever one this copy is served from, never a fixed host. */
  it('tells AnkiConnect to allow the address Monosai is open at', () => {
    expect(text(YourWordsPageComponent)).toContain(`"${location.origin}"`);
  });

  it('says that a connected Anki source refreshes itself', () => {
    const page = text(YourWordsPageComponent);
    expect(page).toContain('refreshes on its own');
    expect(page).toContain('Refresh automatically');
  });

  it('matches every level to its JLPT stage and the words it needs', () => {
    const page = text(ReadingLevelHelpPageComponent);
    for (const level of ['Starter forms', 'Basic forms', 'Everyday forms', 'Literary patterns']) {
      expect(page).toContain(level);
    }
    expect(page).toContain('Literary patterns: 1,400 words');
  });

  it('says translation and notes are prepared unless turned off, and each costs extra', () => {
    const page = text(WritePageComponent);
    expect(page).toContain('Prepare after generation');
    expect(page).toContain('on unless you turn them off');
  });

  it('warns that closing the tab stops a story being written', () => {
    const element = render(WritePageComponent);
    const warning = element.querySelector('.mn-notice--warning')?.textContent ?? '';
    expect(warning).toContain('Reloading or closing it stops the story');
  });

  it('says where the data is and what leaves the device', () => {
    const page = text(PrivacyPageComponent);
    expect(page).toContain('no sync');
    expect(page).toContain('no analytics');
    expect(page).toContain('without encryption');
  });

  /* Local-only storage with no backup is exactly the loss the voice rules ask us to name. */
  it('warns that clearing the browser removes stories for good', () => {
    const element = render(PrivacyPageComponent);
    const warning = [...element.querySelectorAll('.mn-notice--warning')]
      .map((notice) => notice.textContent.replace(/\s+/g, ' '))
      .join(' ');
    expect(warning).toContain('deletes your stories');
  });

  it('leaves the error list to Fix a problem rather than keeping a second copy', () => {
    expect(text(QuestionsPageComponent)).not.toContain('ai/');
  });
});
