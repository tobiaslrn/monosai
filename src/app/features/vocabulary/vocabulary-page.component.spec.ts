import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import {
  ANKI_PROVIDER_FACTORY,
  PACKAGE_PROVIDER_FACTORY,
} from '../../application/shared/anki-tokens';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { VocabularyPageComponent } from './vocabulary-page.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VocabularyPageComponent],
  template: `<mn-vocabulary-page />`,
})
class HostComponent {}

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
    };
  }

  function text(element: HTMLElement, selector: string): string {
    return element.querySelector(selector)?.textContent.trim() ?? '';
  }

  it('renders one heading and the four sections', async () => {
    const { element } = await render();

    expect(text(element, 'h1')).toBe('Vocabulary');
    expect(element.querySelectorAll('section.mn-panel')).toHaveLength(4);
    expect(
      [...element.querySelectorAll('section.mn-panel h2')].map((heading) =>
        heading.textContent.trim(),
      ),
    ).toEqual([
      'Add a vocabulary source',
      'Anki decks and fields',
      'Refresh',
      'Current vocabulary',
    ]);
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
    const { element } = await render();

    expect(element.querySelector('[data-testid="connect-ankiconnect"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="connect-android"]')).toBeNull();
    expect(element.querySelector('[data-testid="package-input"]')).not.toBeNull();
  });

  it('keeps the mapping editor closed until a source is connected', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="mapping-locked"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="add-mapping"]')).toBeNull();
  });

  it('blocks refresh with an explanation before connecting', async () => {
    const { element } = await render();

    const button = element.querySelector<HTMLButtonElement>('[data-testid="start-refresh"]');
    expect(button?.disabled).toBe(true);
    expect(text(element, '[data-testid="refresh-blocked"]')).toContain('Connect to a vocabulary');
  });

  it('opens the mapping editor once discovery succeeds', async () => {
    const { element, fixture, refresh } = await render();

    await refresh.connect(provider);
    await settle(fixture);

    expect(element.querySelector('[data-testid="mapping-locked"]')).toBeNull();
    expect(element.querySelector('[data-testid="add-mapping"]')).not.toBeNull();
  });

  it('announces politely rather than interrupting', async () => {
    const { element } = await render();
    const status = element.querySelector('[data-testid="vocabulary-status"]');

    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.classList.contains('mn-visually-hidden')).toBe(true);
  });

  it('shows the summary for confirmation once a refresh has run', async () => {
    const { element, fixture, refresh } = await render();
    const mappings = TestBed.inject(SourceMappingStore);

    await refresh.connect(provider);
    await mappings.add({
      providerKind: 'desktop-connect',
      deckName: 'Core Japanese',
      deckScope: 'deck-only',
      noteTypeName: 'Basic',
      expressionFieldName: 'Expression',
    });
    await refresh.refresh();
    await settle(fixture);

    expect(element.querySelector('[data-testid="confirm-refresh"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="discard-refresh"]')).not.toBeNull();
    // Counts only: no list of the extracted expressions anywhere on the page.
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

  it('shows an empty current vocabulary state before any refresh', async () => {
    const { element } = await render();
    expect(text(element, '[data-testid="current-snapshot"]')).toContain(
      'No vocabulary snapshot yet',
    );
  });
});
