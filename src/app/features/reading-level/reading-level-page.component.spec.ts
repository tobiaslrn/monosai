import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { By } from '@angular/platform-browser';
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
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { snapshotId } from '../../domain/shared/ids';
import { ReadingLevelPageComponent } from './reading-level-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadingLevelPageComponent],
  template: `<mn-reading-level-page />`,
})
class HostComponent {}

const PACKAGE_FILE = {
  fileName: 'core-japanese.apkg',
  bytes: () => Promise.resolve(new ArrayBuffer(0)),
};

describe('ReadingLevelPageComponent', () => {
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
    /**
     * The page's own store instance.
     *
     * `VocabularyRefreshStore` is provided on the component so that leaving the
     * page discards the refresh, which means the root injector holds a
     * different one; driving that would leave the rendered page untouched.
     */
    readonly refresh: VocabularyRefreshStore;
    /** The page's own import store, for the same reason. */
    readonly packageImport: PackageImportStore;
  }

  async function settle(fixture: ComponentFixture<HostComponent>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(): Promise<Rendered> {
    const fixture = TestBed.createComponent(HostComponent);
    await settle(fixture);
    const page = fixture.debugElement.query(By.directive(ReadingLevelPageComponent));
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      refresh: page.injector.get(VocabularyRefreshStore),
      packageImport: page.injector.get(PackageImportStore),
    };
  }

  function text(element: HTMLElement, selector: string): string {
    return element.querySelector(selector)?.textContent.trim() ?? '';
  }

  function disclosure(element: HTMLElement, id: string): HTMLDetailsElement {
    const found = element.querySelector<HTMLDetailsElement>(`#${id}`);
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

  it('states both facts under one heading', async () => {
    const { element } = await render();

    expect(text(element, 'h1')).toBe('What you can read');
    expect(
      [...element.querySelectorAll('section.mn-panel h2')].map((heading) =>
        heading.textContent.trim(),
      ),
    ).toEqual(['Words', 'Grammar']);
    expect(text(element, '[data-testid="words-standing"]')).toBe('No words yet');
    expect(text(element, '[data-testid="grammar-standing"]')).toBe('Starter forms');
  });

  it('labels every section for assistive technology', async () => {
    const { element } = await render();

    for (const section of element.querySelectorAll('section.mn-panel')) {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).not.toBeNull();
      expect(element.querySelector(`#${String(labelledBy)}`)).not.toBeNull();
    }
  });

  it('counts the words in the learner-facing noun once a source has been read', async () => {
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="add-source"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="choose-ankiconnect"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="connect-ankiconnect"]')?.click();
    await settle(fixture);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.querySelectorAll('mn-anki-mapping-draft select')).toHaveLength(3);
    });
    const selects = element.querySelectorAll<HTMLSelectElement>('mn-anki-mapping-draft select');
    for (const [index, value] of ['Core Japanese', 'Basic', 'Expression'].entries()) {
      selects[index].value = value;
      selects[index].dispatchEvent(new Event('change'));
      await settle(fixture);
    }
    [...element.querySelectorAll<HTMLButtonElement>('mn-anki-mapping-draft button')]
      .find((button) => button.textContent.includes('Preview vocabulary'))
      ?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.textContent).toContain('Confirm vocabulary');
    });
    [...element.querySelectorAll<HTMLButtonElement>('mn-anki-mapping-draft button')]
      .find((button) => button.textContent.includes('Confirm vocabulary'))
      ?.click();

    await vi.waitFor(async () => {
      await settle(fixture);
      expect(text(element, '[data-testid="words-standing"]')).toMatch(/\bwords?$/);
    });
    expect(text(element, '.fact .detail')).toContain('From Anki');
  });

  it('says how many words a story needs while there are too few', async () => {
    const { element, fixture } = await render();
    beds.vocabulary.snapshots.push({
      id: snapshotId('snapshot-1'),
      createdAt: 1_700_000_000_000,
      status: 'complete',
      uniqueEntryCount: 12,
      sourceIds: [],
      sourceKinds: ['anki-connect'],
      analyzerVersion: '1',
      normalizationVersion: '1',
      stats: {
        sourcesQueried: 1,
        entriesRead: 12,
        nonEmptyValues: 12,
        rejectedEmptyValues: 0,
        duplicateOccurrences: 0,
        uniqueExpressions: 12,
        sourceWarnings: [],
      },
    });
    beds.vocabulary.activeSnapshotId = snapshotId('snapshot-1');
    await TestBed.inject(SnapshotHistoryStore).load();
    await settle(fixture);

    expect(text(element, '[data-testid="words-standing"]')).toBe('12 words');
    expect(text(element, '.fact .detail')).toContain('at least 50 words');
  });

  it('names the current value of every closed disclosure', async () => {
    const { element } = await render();

    expect(disclosure(element, 'wording').open).toBe(false);
    expect(text(element, '#wording .summary-value')).toBe('Either');
    expect(disclosure(element, 'forms').open).toBe(false);
    expect(text(element, '#forms .summary-value')).toBe('2 categories');
  });

  it('scrolls a section fragment to the part of the page it named', async () => {
    arriveAt('grammar');
    const { fixture } = await render();
    await settle(fixture);

    await vi.waitFor(() => {
      expect(scrolled).toContain('grammar');
    });
  });

  it('opens the disclosure a fragment points inside before scrolling to it', async () => {
    arriveAt('wording');
    const { element, fixture } = await render();
    await settle(fixture);

    await vi.waitFor(() => {
      expect(disclosure(element, 'wording').open).toBe(true);
    });
    expect(scrolled).toContain('wording');
  });

  it('reports a source failure with a recovery and an escape', async () => {
    const { element, fixture, refresh } = await render();

    await refresh.connect(
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        probeError: { domain: 'anki', code: 'origin-not-allowed', message: 'blocked' },
      }),
    );
    await settle(fixture);
    const alert = element.querySelector('[role="alert"]');

    expect(alert?.textContent).toContain('Anki refused this address');
    expect(alert?.textContent).toContain('still current');
    expect(alert?.textContent).toContain('anki/origin-not-allowed');
  });

  it('keeps the language failure surface and its retry', async () => {
    const { element, fixture } = await render();
    beds.languageStatus.set('failed');
    await settle(fixture);

    const failed = element.querySelector('.assets-failed');
    expect(failed?.getAttribute('role')).toBe('alert');
    expect(failed?.textContent).toContain('profile is unchanged');
    expect(element.querySelector('mn-preset-picker')).toBeNull();
    expect(failed?.querySelector('button')?.textContent.trim()).toBe('Try again');
  });

  it('asks what to import when a package leaves the note type open', async () => {
    const { element, fixture, packageImport } = await render();

    await packageImport.start(PACKAGE_FILE);
    await settle(fixture);

    expect(element.querySelector('[data-testid="package-import-selection"]')).not.toBeNull();
    expect(text(element, '[data-testid="words-standing"]')).toBe('No words yet');

    element.querySelector<HTMLButtonElement>('[data-testid="package-import-confirm"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(text(element, '[data-testid="package-import-complete"]')).toContain('Core Japanese');
    });
    expect(text(element, '[data-testid="words-standing"]')).toMatch(/\bwords?$/);
  });

  it('saves the chosen AnkiConnect port before connecting', async () => {
    const { element, fixture } = await render();
    const settings = TestBed.inject(AppSettingsStore);

    element.querySelector<HTMLButtonElement>('[data-testid="add-source"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="choose-ankiconnect"]')?.click();
    await settle(fixture);
    const port = element.querySelector<HTMLInputElement>('[data-testid="anki-connect-port"]');
    if (port === null) throw new Error('missing AnkiConnect port input');
    port.value = '9999';
    port.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('[data-testid="connect-ankiconnect"]')?.click();

    await vi.waitFor(() => {
      expect(settings.ankiConnectPort()).toBe(9_999);
    });
  });

  it('announces politely rather than interrupting', async () => {
    const { element } = await render();
    const status = element.querySelector('[data-testid="vocabulary-status"]');

    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.classList.contains('mn-visually-hidden')).toBe(true);
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
  });
});
