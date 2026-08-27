import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import {
  ANKI_PROVIDER_FACTORY,
  PACKAGE_PROVIDER_FACTORY,
} from '../../application/shared/anki-tokens';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularyPageComponent } from './vocabulary-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VocabularyPageComponent],
  template: `<mn-vocabulary-page />`,
})
class HostComponent {}

const PACKAGE_FILE = {
  fileName: 'core-japanese.apkg',
  bytes: () => Promise.resolve(new ArrayBuffer(0)),
};

describe('VocabularyPageComponent', () => {
  let provider: FakeAnkiProvider;

  beforeEach(() => {
    configureVocabularyTestBed();
    provider = new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, { useValue: () => provider });
    TestBed.overrideProvider(PACKAGE_PROVIDER_FACTORY, { useValue: () => provider });
    TestBed.inject(SnapshotHistoryStore);
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
    const page = fixture.debugElement.query(By.directive(VocabularyPageComponent));
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

  it('renders one heading and a compact overview with unified sources', async () => {
    const { element } = await render();

    expect(text(element, 'h1')).toBe('Vocabulary');
    expect(element.querySelectorAll('section.mn-panel')).toHaveLength(2);
    expect(
      [...element.querySelectorAll('section.mn-panel h2')].map((heading) =>
        heading.textContent.trim(),
      ),
    ).toEqual(['Current', 'Sources']);
  });

  it('labels every section for assistive technology', async () => {
    const { element } = await render();

    for (const section of element.querySelectorAll('section.mn-panel')) {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).not.toBeNull();
      expect(element.querySelector(`#${String(labelledBy)}`)).not.toBeNull();
    }
  });

  it('offers both source paths', async () => {
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="add-source"]')?.click();
    await settle(fixture);

    expect(element.querySelector('[data-testid="choose-ankiconnect"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="connect-android"]')).toBeNull();
    expect(element.querySelector('[data-testid="package-input"]')).not.toBeNull();
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

  it('shows one empty source list before a source is added', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="mapping-locked"]')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid="add-source"]')).toHaveLength(1);
  });

  it('does not expose a manual refresh workflow', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="start-refresh"]')).toBeNull();
    expect(element.querySelector('mn-refresh-stepper')).toBeNull();
    expect(element.querySelector('mn-refresh-summary')).toBeNull();
  });

  it('announces politely rather than interrupting', async () => {
    const { element } = await render();
    const status = element.querySelector('[data-testid="vocabulary-status"]');

    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.classList.contains('mn-visually-hidden')).toBe(true);
  });

  it('applies a newly added Anki source without asking for refresh or confirmation', async () => {
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="add-source"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="choose-ankiconnect"]')?.click();
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="connect-ankiconnect"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(text(element, '[data-testid="current-snapshot"]')).toContain('unique expressions');
    });

    expect(element.querySelector('[data-testid="confirm-refresh"]')).toBeNull();
    expect(element.textContent).not.toContain('ねこ');
  });

  it('reports a connection failure with a recovery and an escape', async () => {
    const { element, fixture, refresh } = await render();

    await refresh.connect(
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        probeError: {
          domain: 'anki',
          code: 'origin-not-allowed',
          message: 'blocked',
        },
      }),
    );
    await settle(fixture);
    const alert = element.querySelector('[role="alert"]');

    expect(alert?.textContent).toContain('Anki refused this address');
    expect(alert?.textContent).toContain('still current');
    expect(alert?.textContent).toContain('package');
    expect(alert?.textContent).toContain('anki/origin-not-allowed');
  });

  it('asks what to import when a package leaves the note type open', async () => {
    const { element, fixture, packageImport } = await render();

    await packageImport.start(PACKAGE_FILE);
    await settle(fixture);

    const selection = element.querySelector('[data-testid="package-import-selection"]');
    expect(selection).not.toBeNull();
    expect(selection?.querySelector('h3')?.getAttribute('tabindex')).toBe('-1');
    expect(element.querySelector('[data-testid="package-import-note-type"]')).not.toBeNull();
    expect(text(element, '[data-testid="current-snapshot"]')).toContain('No words yet');

    element.querySelector<HTMLButtonElement>('[data-testid="package-import-confirm"]')?.click();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(text(element, '[data-testid="package-import-complete"]')).toContain('Core Japanese');
    });
    expect(text(element, '[data-testid="current-snapshot"]')).toContain('unique expressions');
  });

  it('keeps the vocabulary and offers no retry when a package cannot be read', async () => {
    const { element, fixture, packageImport } = await render();
    // The page's factory hands back whatever this variable holds, so the next
    // provider it asks for is the one that cannot open the file.
    provider = new FakeAnkiProvider(CONTRACT_COLLECTION, {
      kind: 'package',
      probeError: {
        domain: 'anki',
        code: 'package-unreadable',
        message: 'This file could not be read as an Anki package.',
      },
    });

    await packageImport.start(PACKAGE_FILE);
    await settle(fixture);

    const failure = element.querySelector('[data-testid="package-import-failed"]');
    expect(failure?.getAttribute('role')).toBe('alert');
    expect(failure?.textContent).toContain('could not be read');
    expect(failure?.textContent).toContain('unchanged');
    expect(failure?.textContent).toContain('anki/package-unreadable');
    expect(element.querySelector('[data-testid="package-import-retry"]')).toBeNull();
  });

  it('shows an empty current vocabulary state before any refresh', async () => {
    const { element } = await render();
    expect(text(element, '[data-testid="current-snapshot"]')).toContain('No words yet');
  });
});
