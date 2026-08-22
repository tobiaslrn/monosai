import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { snapshotFixture } from '../../../testing/persistence-fixtures';
import type { AutomaticAnkiSyncStatus } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { VocabularySyncBannerComponent } from './vocabulary-sync-banner.component';

function render(initial: AutomaticAnkiSyncStatus) {
  const status = signal<AutomaticAnkiSyncStatus>(initial);
  const coordinator = {
    status: status.asReadonly(),
    trigger: () => Promise.resolve(),
  };
  TestBed.configureTestingModule({
    imports: [VocabularySyncBannerComponent],
    providers: [
      provideRouter([]),
      { provide: AutomaticAnkiSyncCoordinator, useValue: coordinator },
    ],
  });
  const fixture = TestBed.createComponent(VocabularySyncBannerComponent);
  fixture.detectChanges();
  return { fixture, status, element: fixture.nativeElement as HTMLElement };
}

describe('VocabularySyncBannerComponent', () => {
  it('keeps routine background states out of the visible UI', () => {
    const rendered = render({ kind: 'checking' });

    expect(rendered.element.querySelector('.toast, .banner')).toBeNull();

    rendered.status.set({ kind: 'waiting', message: 'Anki is not running.' });
    rendered.fixture.detectChanges();
    expect(rendered.element.querySelector('.toast, .banner')).toBeNull();

    rendered.status.set({ kind: 'idle' });
    rendered.fixture.detectChanges();
    expect(rendered.element.querySelector('.toast, .banner')).toBeNull();
  });

  it('renders a polite success toast for a changed vocabulary', () => {
    const { element } = render({ kind: 'updated', snapshot: snapshotFixture(21).snapshot });

    const toast = element.querySelector('[data-testid="vocabulary-sync-toast"]');
    expect(toast?.classList.contains('toast')).toBe(true);
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(toast?.textContent).toContain('Vocabulary updated');
  });

  it('keeps actionable errors visible with recovery actions', () => {
    const { element } = render({ kind: 'attention', message: 'The Anki mapping is stale.' });

    const banner = element.querySelector('.banner.attention');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.textContent).toContain('The Anki mapping is stale.');
    expect(banner?.textContent).toContain('Retry now');
    expect(banner?.textContent).toContain('Manage sources');
  });
});
