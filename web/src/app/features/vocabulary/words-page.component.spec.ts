import { chooseValue } from '../../../testing/select';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { snapshotId } from '../../domain/shared/ids';
import { WordsPageComponent } from './words-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WordsPageComponent],
  template: `<mn-words-page />`,
})
class HostComponent {}

const PACKAGE_FILE = {
  fileName: 'core-japanese.apkg',
  bytes: () => Promise.resolve(new ArrayBuffer(0)),
};

describe('WordsPageComponent', () => {
  let provider: FakeAnkiProvider;
  let beds: ReadingLevelTestBed;

  beforeEach(() => {
    beds = configureReadingLevelTestBed();
    provider = new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, { useValue: () => provider });
    TestBed.overrideProvider(PACKAGE_PROVIDER_FACTORY, { useValue: () => provider });
  });

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
    const page = fixture.debugElement.query(By.directive(WordsPageComponent));
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

  it('states the words and where they come from', async () => {
    const { element } = await render();

    expect(text(element, 'h1')).toBe('Words');
    expect(
      [...element.querySelectorAll('section.group > header > h2')].map((heading) =>
        heading.textContent.trim(),
      ),
    ).toEqual(['Word sources']);
    expect(text(element, '[data-testid="words-standing"]')).toBe('No words yet');
    expect(element.querySelector('[data-testid="reading-level-link"]')).toBeNull();
  });
  it('labels every section for assistive technology', async () => {
    const { element } = await render();

    const sections = element.querySelectorAll('section.group');
    expect(sections).toHaveLength(1);
    for (const section of sections) {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).not.toBeNull();
      expect(element.querySelector(`#${String(labelledBy)}`)).not.toBeNull();
    }
  });

  /**
   * Both drafts once rendered inside the section's action slot, where a form
   * got the width a button asks for and grew the heading row around itself.
   */
  it('drafts a source in the section rather than beside its heading', async () => {
    const { element, fixture } = await render();
    const action = element.querySelector('.mn-settings-section__action');
    if (action === null) throw new Error('the section has no action slot');

    element.querySelector<HTMLButtonElement>('[data-testid="add-words"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="add-text-source"]')?.click();
    await settle(fixture);

    const editor = element.querySelector('[data-testid="text-source-editor"]');
    expect(editor).not.toBeNull();
    expect(action.contains(editor)).toBe(false);

    element.querySelector<HTMLButtonElement>('[data-testid="choose-anki"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.querySelector('mn-anki-mapping-draft mn-card')).not.toBeNull();
    });
    expect(action.contains(element.querySelector('mn-anki-mapping-draft'))).toBe(false);
  });

  it('counts the words in the learner-facing noun once a source has been read', async () => {
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="add-words"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="choose-anki"]')?.click();
    await settle(fixture);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.querySelectorAll('mn-anki-mapping-draft [role="combobox"]')).toHaveLength(4);
    });
    const selects = element.querySelectorAll<HTMLElement>(
      'mn-anki-mapping-draft [role="combobox"]',
    );
    for (const [index, value] of ['Core Japanese', 'Basic', 'Expression', 'Meaning'].entries()) {
      chooseValue(selects[index]!, value);
      await settle(fixture);
    }
    [...element.querySelectorAll<HTMLButtonElement>('mn-anki-mapping-draft button')]
      .find((button) => button.textContent.includes('Preview vocabulary'))
      ?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.textContent).toContain('Confirm words');
    });
    [...element.querySelectorAll<HTMLButtonElement>('mn-anki-mapping-draft button')]
      .find((button) => button.textContent.includes('Confirm words'))
      ?.click();

    await vi.waitFor(async () => {
      await settle(fixture);
      expect(text(element, '[data-testid="words-standing"]')).toMatch(/\bwords?$/);
    });
    const rows = element.querySelectorAll('[data-testid="source-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('On this computer');
  });

  it('says how many words a story needs while there are too few', async () => {
    const { element, fixture } = await render();
    beds.vocabulary.snapshots.push({
      id: snapshotId('snapshot-1'),
      revision: 'revision-1',
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
    expect(text(element, '[data-testid="words-shortfall"]')).toContain('at least 50 words');
  });

  /**
   * The failure belongs where the learner is standing when it happens: in the
   * sheet they just pressed Anki in, with the code and the way to look it up.
   */
  it('reports a failed connection in the sheet, with its code and a way to look it up', async () => {
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, {
      useValue: () =>
        new FakeAnkiProvider(CONTRACT_COLLECTION, {
          probeError: { domain: 'anki', code: 'not-running', message: 'nothing answered' },
        }),
    });
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="add-words"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="choose-anki"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.querySelector('[data-testid="anki-connect-failed"]')).not.toBeNull();
    });

    const alert = element.querySelector('[data-testid="anki-connect-failed"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Anki is not answering');
    expect(alert?.querySelector('details')?.open).toBe(false);
    expect(alert?.textContent).toContain('AnkiConnect add-on');
    expect(alert?.textContent).toContain('anki/not-running');
    expect(alert?.querySelector('a[href$="#/help/troubleshooting"]')).not.toBeNull();
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

  /**
   * The port is only ever touched when a connection fails, so that is the only
   * place it is offered — behind a disclosure, beside the retry it changes.
   */
  it('offers the port only after a failure, and saves it on the retry', async () => {
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, {
      useValue: () =>
        new FakeAnkiProvider(CONTRACT_COLLECTION, {
          probeError: { domain: 'anki', code: 'not-running', message: 'nothing answered' },
        }),
    });
    const { element, fixture } = await render();
    const settings = TestBed.inject(AppSettingsStore);

    element.querySelector<HTMLButtonElement>('[data-testid="add-words"]')?.click();
    await settle(fixture);
    expect(element.querySelector('[data-testid="anki-connect-port"]')).toBeNull();

    element.querySelector<HTMLButtonElement>('[data-testid="choose-anki"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(element.querySelector('[data-testid="anki-connect-port"]')).not.toBeNull();
    });

    const port = element.querySelector<HTMLInputElement>('[data-testid="anki-connect-port"]');
    if (port === null) throw new Error('missing AnkiConnect port input');
    port.value = '9999';
    port.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('[data-testid="anki-retry"]')?.click();

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
});
