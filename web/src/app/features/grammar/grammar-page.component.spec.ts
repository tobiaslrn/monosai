import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import {
  configureReadingLevelTestBed,
  type ReadingLevelTestBed,
} from '../../../testing/reading-level-fakes';
import {
  ANKI_PROVIDER_FACTORY,
  PACKAGE_PROVIDER_FACTORY,
} from '../../application/shared/anki-tokens';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { GrammarPageComponent } from './grammar-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GrammarPageComponent],
  template: `<mn-grammar-page />`,
})
class HostComponent {}

describe('GrammarPageComponent', () => {
  let provider: FakeAnkiProvider;
  let beds: ReadingLevelTestBed;
  let scrolled: string[];

  beforeEach(() => {
    beds = configureReadingLevelTestBed();
    provider = new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, { useValue: () => provider });
    TestBed.overrideProvider(PACKAGE_PROVIDER_FACTORY, { useValue: () => provider });

    // jsdom has no layout and no `scrollIntoView`, so it is recorded instead.
    scrolled = [];
    Element.prototype.scrollIntoView = function (this: Element): void {
      scrolled.push(this.id);
    };
  });

  /** Deep links arrive as a fragment, which the page resolves itself. */
  function arriveAt(fragment: string): void {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { fragment: of(fragment), snapshot: { fragment, queryParams: {} } },
    });
  }

  interface Rendered {
    readonly fixture: ComponentFixture<HostComponent>;
    readonly element: HTMLElement;
  }

  async function settle(fixture: ComponentFixture<HostComponent>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(): Promise<Rendered> {
    const fixture = TestBed.createComponent(HostComponent);
    await settle(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function text(element: HTMLElement, selector: string): string {
    return element.querySelector(selector)?.textContent.trim() ?? '';
  }

  function disclosure(element: HTMLElement, id: string): HTMLDetailsElement {
    // A disclosure carries the id on its host and folds in its own `details`.
    const found = element.querySelector<HTMLDetailsElement>(`#${id} details, details#${id}`);
    if (found === null) {
      throw new Error(`missing disclosure ${id}`);
    }
    return found;
  }

  /**
   * Three screens lead here, and each gets its own place back. Landing on the
   * Library after arriving from Settings loses where the learner was.
   */
  it('goes back to wherever it was reached from', async () => {
    const { element } = await render();
    expect(element.querySelector('.head a')?.getAttribute('aria-label')).toBe('Back to library');

    history.replaceState({ monosaiNavigationOrigin: '/settings' }, '');
    TestBed.resetTestingModule();
    beds = configureReadingLevelTestBed();
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, { useValue: () => provider });
    TestBed.overrideProvider(PACKAGE_PROVIDER_FACTORY, { useValue: () => provider });
    const fromSettings = await render();

    expect(fromSettings.element.querySelector('.head button')?.getAttribute('aria-label')).toBe(
      'Back to settings',
    );
    history.replaceState({}, '');
  });

  it('states the reading level under its own heading', async () => {
    const { element } = await render();

    expect(text(element, 'h1')).toBe('Grammar');
    expect(element.querySelector('section.group')).toBeNull();
    expect(text(element, '[data-testid="grammar-standing"]')).toBe('Starter forms');
    expect(element.querySelector('[data-testid="words-standing"]')).toBeNull();
  });
  /** The ladder is a page of its own; this one states the level and leads there. */
  it('leads to the ladder rather than showing it', async () => {
    const { element } = await render();

    expect(element.querySelector('mn-preset-picker')).toBeNull();
    expect(element.querySelector('mn-list-row')).not.toBeNull();
    expect(element.querySelector('[data-testid="reading-level-link"]')?.getAttribute('href')).toBe(
      '/grammar/level',
    );
    expect(element.querySelector('mn-example .ja')?.getAttribute('lang')).toBe('ja');
  });

  it('names the current value of every closed disclosure', async () => {
    const { element } = await render();

    expect(disclosure(element, 'forms').open).toBe(false);
    expect(text(element, '#forms .mn-settings-row__details')).toBe('2 categories');
  });

  it('opens the disclosure a fragment points inside before scrolling to it', async () => {
    arriveAt('forms');
    const { element, fixture } = await render();
    await settle(fixture);

    await vi.waitFor(() => {
      expect(disclosure(element, 'forms').open).toBe(true);
    });
    expect(scrolled).toContain('forms');
  });

  /** Every register is allowed and the preset's prose is sent, so neither is offered. */
  it('offers no register or wording to change', async () => {
    const { element } = await render();

    expect(element.querySelector('#wording')).toBeNull();
    expect(element.querySelector('mn-guidance-section')).toBeNull();
    expect(element.textContent).not.toContain('Register');
  });

  it('keeps the language failure surface and its retry', async () => {
    const { element, fixture } = await render();
    beds.languageStatus.set('failed');
    await settle(fixture);

    const failed = element.querySelector('.assets-failed');
    expect(failed?.getAttribute('role')).toBe('alert');
    expect(failed?.textContent).toContain('level is unchanged');
    expect(element.querySelector('mn-preset-picker')).toBeNull();
    expect(failed?.querySelector('button')?.textContent.trim()).toBe('Try again');
  });

  it('confirms a grammar change without asking for an acknowledgement', async () => {
    const { element, fixture } = await render();

    await TestBed.inject(GrammarProfileStore).selectPreset('mn-preset-basic');
    await settle(fixture);

    const confirmation = element.querySelector('[data-testid="grammar-confirmation"]');
    expect(confirmation?.getAttribute('aria-live')).toBe('polite');
    expect(confirmation?.textContent).toContain('Basic forms');
    expect(confirmation?.textContent).toContain('out of date');
    expect(text(element, '[data-testid="grammar-standing"]')).toBe('Basic forms');
    // The level a caption names rides beside the name, never inside it, and no pill holds it.
    const row = element.querySelector('[data-testid="reading-level-link"]');
    expect(row?.querySelector('.mn-status-pill')).toBeNull();
    expect(
      [...(row?.querySelectorAll('[mn-list-row-meta] > span') ?? [])].map((fact) =>
        fact.textContent.trim(),
      ),
    ).toEqual(['Basic forms', 'N5']);
  });
});
