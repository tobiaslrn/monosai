import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeService } from './theme.service';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';

const LIGHT = '#f8f6f1';
const DARK = '#1b1d1a';

function themeColors(): (string | null)[] {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute('content'),
  );
}

describe('ThemeService', () => {
  let media: FakeMediaMatcher;
  let style: HTMLStyleElement;
  let metas: HTMLMetaElement[];

  beforeEach(() => {
    TestBed.resetTestingModule();
    media = installFakeMatchMedia(1440);
    style = document.createElement('style');
    style.textContent = `:root { --surface-canvas: ${LIGHT}; }
      :root[data-theme='dark'] { --surface-canvas: ${DARK}; }`;
    document.head.append(style);
    metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((query) => {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.media = query;
      document.head.append(meta);
      return meta;
    });
  });

  afterEach(() => {
    media.restore();
    style.remove();
    for (const meta of metas) {
      meta.remove();
    }
    document.documentElement.removeAttribute('data-theme');
  });

  it('paints the browser chrome with the canvas of the chosen theme', () => {
    const service = TestBed.inject(ThemeService);

    service.apply('dark');
    TestBed.tick();
    expect(themeColors()).toEqual([DARK, DARK]);

    service.apply('light');
    TestBed.tick();
    expect(themeColors()).toEqual([LIGHT, LIGHT]);
  });
});
