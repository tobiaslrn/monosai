import { Dialog } from '@angular/cdk/dialog';
import type { BusyWork } from '../../domain/shared/busy-work';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppBusyRegistry } from '../../application/shared/app-busy.registry';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateChecker,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { ok } from '../../domain/shared/result';
import { AppUpdateBannerComponent } from './app-update-banner.component';

class FakeChecker implements AppUpdateChecker {
  readonly events = new Subject<AppUpdateEvent>();
  updates() {
    return this.events.asObservable();
  }
  check() {
    return Promise.resolve(ok(undefined));
  }
}

function render(confirmed = true) {
  const checker = new FakeChecker();
  const reload = vi.fn();
  const dialogOpen = vi.fn(() => ({ closed: of(confirmed) }));
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_UPDATE_CHECKER, useValue: checker },
      { provide: APP_RELOAD, useValue: reload },
      { provide: Dialog, useValue: { open: dialogOpen } },
    ],
  });
  const busy = TestBed.inject(AppBusyRegistry);
  const fixture = TestBed.createComponent(AppUpdateBannerComponent);
  fixture.detectChanges();
  return {
    fixture,
    checker,
    busy,
    reload,
    dialogOpen,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('AppUpdateBannerComponent', () => {
  it('renders nothing while idle', () => {
    const { element } = render();

    expect(element.querySelector('.banner')).toBeNull();
  });

  it('shows a non-modal status banner, never a dialog, when the worker breaks', () => {
    const { fixture, checker, element } = render();

    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
    fixture.detectChanges();

    const banner = element.querySelector('.banner');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(element.querySelector('dialog, [role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(banner);
  });

  it('disables the recovery reload and explains why while busy work is in progress', () => {
    const { fixture, checker, busy, element, reload } = render();
    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
    busy.track('generation', signal<BusyWork | null>({ kind: 'story-generation', count: 1 }));
    fixture.detectChanges();

    const button = element.querySelector('button');
    expect(button?.textContent).toContain('Reload to recover');
    expect(button?.disabled).toBe(true);
    expect(element.textContent).toContain('Finishing current work…');
    button?.click();
    expect(reload).not.toHaveBeenCalled();
  });

  // A story whose save failed never finishes, so it is asked about instead of
  // holding the reload disabled for good.
  it.each([
    [true, 1],
    [false, 0],
  ])(
    'asks before a recovery reload loses an unsaved story (confirmed: %s)',
    async (confirmed, reloads) => {
      const { fixture, checker, busy, element, reload, dialogOpen } = render(confirmed);
      checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
      busy.track('generation', signal<BusyWork | null>({ kind: 'unsaved-story', count: 1 }));
      fixture.detectChanges();

      const button = element.querySelector('button');
      expect(button?.disabled).toBe(false);
      expect(element.textContent).not.toContain('Finishing current work');
      button?.click();

      await vi.waitFor(() => {
        expect(dialogOpen).toHaveBeenCalledOnce();
      });
      const asked = JSON.stringify(dialogOpen.mock.calls);
      expect(asked).toContain('Reload and lose the new story?');
      await vi.waitFor(() => {
        expect(reload).toHaveBeenCalledTimes(reloads);
      });
    },
  );

  it('offers a reload action for an unrecoverable state', () => {
    const { fixture, checker, element } = render();

    checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
    fixture.detectChanges();

    const banner = element.querySelector('.banner');
    expect(banner?.textContent).toContain('missing chunk');
    const buttons = [...element.querySelectorAll('button')];
    const reloadButton = buttons.find((el) => el.textContent.includes('Reload to recover'));
    expect(reloadButton).toBeDefined();
  });

  describe('when this tab lost its database', () => {
    function lose(view: ReturnType<typeof render>) {
      TestBed.inject(AppUpdateStore).reportDatabaseLost('another-tab');
      view.fixture.detectChanges();
    }

    function reloadButton(element: HTMLElement): HTMLButtonElement {
      const button = [...element.querySelectorAll('button')].find(
        (candidate) => candidate.textContent.trim() === 'Reload',
      );
      if (button === undefined) {
        throw new Error('no Reload button');
      }
      return button;
    }

    it('says so as an alert and reloads at once when nothing is unsaved', () => {
      const view = render();
      lose(view);

      expect(view.element.querySelector('.banner')?.getAttribute('role')).toBe('alert');
      expect(view.element.textContent).toContain('can no longer save');
      reloadButton(view.element).click();

      expect(view.dialogOpen).not.toHaveBeenCalled();
      expect(view.reload).toHaveBeenCalledTimes(1);
    });

    it('does not claim to wait for work, and asks before discarding unsaved work', async () => {
      const view = render(false);
      view.busy.track('import-draft', signal<BusyWork | null>({ kind: 'import-draft' }));
      lose(view);

      expect(view.element.textContent).not.toContain('Finishing current work');
      expect(reloadButton(view.element).disabled).toBe(false);
      reloadButton(view.element).click();

      // The dialog code loads on demand, so the question appears a moment after the press.
      await vi.waitFor(() => {
        expect(view.dialogOpen).toHaveBeenCalledTimes(1);
      });
      expect(JSON.stringify(view.dialogOpen.mock.calls)).toContain('An import draft is unsaved');
      expect(view.reload).not.toHaveBeenCalled();
    });

    it('reloads once the learner confirms discarding the work', async () => {
      const view = render(true);
      view.busy.track('import-draft', signal<BusyWork | null>({ kind: 'import-draft' }));
      lose(view);

      reloadButton(view.element).click();

      await vi.waitFor(() => {
        expect(view.reload).toHaveBeenCalledTimes(1);
      });
    });

    it('stays after the worker reports a failure', () => {
      const view = render();
      lose(view);

      view.checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
      view.fixture.detectChanges();

      expect(view.element.textContent).toContain('can no longer save');
      expect(view.element.textContent).not.toContain('missing chunk');
    });
  });

  it('shows only a lost database where the surface carries no chrome', () => {
    const view = render();
    view.fixture.componentRef.setInput('supersededOnly', true);
    view.checker.events.next({ kind: 'unrecoverable', reason: 'missing chunk' });
    view.fixture.detectChanges();
    expect(view.element.querySelector('.banner')).toBeNull();

    TestBed.inject(AppUpdateStore).reportDatabaseLost('another-tab');
    view.fixture.detectChanges();

    expect(view.element.textContent).toContain('can no longer save');
  });
});
