import { Dialog } from '@angular/cdk/dialog';
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
  activate() {
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

  it('shows a non-modal status banner, never a dialog, once an update is available', () => {
    const { fixture, checker, element } = render();

    checker.events.next({ kind: 'ready' });
    fixture.detectChanges();

    const banner = element.querySelector('.banner');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(element.querySelector('dialog, [role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(banner);
    expect(banner?.textContent).toContain('Update ready');
  });

  it('disables the update action and explains why while busy work is in progress', () => {
    const { fixture, checker, busy, element } = render();
    checker.events.next({ kind: 'ready' });
    busy.track('generation', signal('a story is being generated'));
    fixture.detectChanges();

    const enabledButton = element.querySelector('button:not([disabled])');
    const disabledButton = element.querySelector('button[disabled]');
    expect(disabledButton).not.toBeNull();
    expect(disabledButton?.textContent).toContain('Reload to update');
    expect(enabledButton).toBeNull();
    expect(element.textContent).toContain('Finishing current work…');
  });

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
      view.busy.track('import-draft', signal('an import draft is unsaved'));
      lose(view);

      expect(view.element.textContent).not.toContain('Finishing current work');
      expect(reloadButton(view.element).disabled).toBe(false);
      reloadButton(view.element).click();
      await view.fixture.whenStable();

      expect(view.dialogOpen).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(view.dialogOpen.mock.calls)).toContain('An import draft is unsaved');
      expect(view.reload).not.toHaveBeenCalled();
    });

    it('reloads once the learner confirms discarding the work', async () => {
      const view = render(true);
      view.busy.track('import-draft', signal('an import draft is unsaved'));
      lose(view);

      reloadButton(view.element).click();
      await view.fixture.whenStable();

      expect(view.reload).toHaveBeenCalledTimes(1);
    });

    it('stays after an update is announced', () => {
      const view = render();
      lose(view);

      view.checker.events.next({ kind: 'ready' });
      view.fixture.detectChanges();

      expect(view.element.textContent).toContain('can no longer save');
      expect(view.element.textContent).not.toContain('is ready');
    });
  });

  it('shows only a lost database where the surface carries no chrome', () => {
    const view = render();
    view.fixture.componentRef.setInput('supersededOnly', true);
    view.checker.events.next({ kind: 'ready' });
    view.fixture.detectChanges();
    expect(view.element.querySelector('.banner')).toBeNull();

    TestBed.inject(AppUpdateStore).reportDatabaseLost('another-tab');
    view.fixture.detectChanges();

    expect(view.element.textContent).toContain('can no longer save');
  });
});
