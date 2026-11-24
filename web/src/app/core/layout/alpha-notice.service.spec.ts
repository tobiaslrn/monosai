import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import {
  APP_RELOAD,
  APP_UPDATE_CHECKER,
  type AppUpdateChecker,
  type AppUpdateEvent,
} from '../../domain/platform/app-update.port';
import { ok } from '../../domain/shared/result';
import type { AlphaNoticeDialogData } from '../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component';
import {
  ALPHA_DIALOG_OPENER,
  AlphaNoticeService,
  type AlphaDialogHandle,
} from './alpha-notice.service';
import { AppUpdateBannerComponent } from './app-update-banner.component';

describe('AlphaNoticeService', () => {
  function configure(seen = false) {
    const open = vi.fn<(data: AlphaNoticeDialogData) => Promise<AlphaDialogHandle>>(() =>
      Promise.resolve({ close: vi.fn() }),
    );
    const settings = {
      alphaNoticeSeen: vi.fn().mockReturnValue(seen),
      markAlphaNoticeSeen: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        AlphaNoticeService,
        { provide: ALPHA_DIALOG_OPENER, useValue: { open } },
        { provide: AppSettingsStore, useValue: settings },
        { provide: AppUpdateStore, useValue: { status: signal({ kind: 'idle' }) } },
      ],
    });
    return { service: TestBed.inject(AlphaNoticeService), open, settings };
  }

  it('opens a blocking alert dialog once when the acknowledgment is not saved', async () => {
    const { service, open } = configure();

    await service.offer();
    await service.offer();

    expect(open).toHaveBeenCalledOnce();
    const data = open.mock.calls[0]![0];
    expect(data.acknowledge).toBeTypeOf('function');
  });

  it('does not open when the acknowledgment was already saved', async () => {
    const { service, open } = configure(true);

    await service.offer();

    expect(open).not.toHaveBeenCalled();
  });

  it('passes the settings acknowledgment through to the dialog', async () => {
    const { service, open, settings } = configure();

    await service.offer();
    const data = open.mock.calls[0]![0];

    expect(await data.acknowledge()).toBe(true);
    expect(settings.markAlphaNoticeSeen).toHaveBeenCalledOnce();
  });
});

class QuietChecker implements AppUpdateChecker {
  readonly events = new Subject<AppUpdateEvent>();
  updates() {
    return this.events.asObservable();
  }
  check() {
    return Promise.resolve(ok(undefined));
  }
}

function alphaDialog(): HTMLElement | null {
  return document.querySelector('[role="alertdialog"]');
}

function insideHiddenSubtree(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert')) {
      return true;
    }
  }
  return false;
}

describe('AlphaNoticeService once the database is lost', () => {
  function configure() {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_UPDATE_CHECKER, useValue: new QuietChecker() },
        { provide: APP_RELOAD, useValue: vi.fn() },
        {
          provide: AppSettingsStore,
          useValue: {
            alphaNoticeSeen: signal(false),
            // The connection is gone, so every write fails.
            markAlphaNoticeSeen: vi.fn(() => Promise.resolve(false)),
          },
        },
      ],
    });
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => {
      node.remove();
    });
  });

  it('closes an open notice so the lost-database Reload is reachable', async () => {
    configure();
    const banner = TestBed.createComponent(AppUpdateBannerComponent);
    document.body.appendChild(banner.nativeElement as HTMLElement);
    banner.detectChanges();
    await TestBed.inject(AlphaNoticeService).offer();
    await vi.waitFor(() => {
      expect(alphaDialog()).not.toBeNull();
    });

    TestBed.inject(AppUpdateStore).reportDatabaseLost('another-tab');
    TestBed.tick();
    banner.detectChanges();

    await vi.waitFor(() => {
      expect(alphaDialog()).toBeNull();
    });
    const reload = Array.from(
      (banner.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent.trim() === 'Reload');
    expect(reload).toBeDefined();
    expect(insideHiddenSubtree(reload!)).toBe(false);
  });

  it('is not offered when the database is already lost', async () => {
    configure();
    TestBed.inject(AppUpdateStore).reportDatabaseLost('another-tab');

    await TestBed.inject(AlphaNoticeService).offer();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(alphaDialog()).toBeNull();
  });
});
