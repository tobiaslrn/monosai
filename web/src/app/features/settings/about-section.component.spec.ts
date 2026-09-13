import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateStore, type AppUpdateStatus } from '../../application/pwa/app-update.store';
import type { Logger } from '../../application/shared/diagnostics';
import { LOGGER } from '../../application/shared/diagnostics';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import { InstallPromptService } from '../../core/platform/install-prompt.service';
import { AboutSectionComponent } from './about-section.component';

function loggerFake(entries = 1): {
  readonly logger: Logger;
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
} {
  const info = vi.fn();
  const warn = vi.fn();
  const clear = vi.fn();
  let current = Array.from({ length: entries }, (_, index) => ({
    level: 'info' as const,
    event: 'app.initialization.succeeded' as const,
    timestamp: '2026-08-22T00:00:00.000Z',
    appVersion: '0.1.0',
    buildCommit: 'test',
    fields: { count: index },
  }));
  const logger: Logger = {
    debug: vi.fn(),
    info,
    warn,
    error: vi.fn(),
    snapshot: () => current,
    clear: clear.mockImplementation(() => {
      current = [];
    }),
  };
  return { logger, info, warn, clear };
}

describe('AboutSectionComponent', () => {
  let standalone: ReturnType<typeof signal<boolean>>;
  let canInstall: ReturnType<typeof signal<boolean>>;
  let updateStatus: ReturnType<typeof signal<AppUpdateStatus>>;
  let install: ReturnType<typeof vi.fn>;
  let check: ReturnType<typeof vi.fn>;
  let fakeLogger: ReturnType<typeof loggerFake>;

  beforeEach(() => {
    standalone = signal(false);
    canInstall = signal(false);
    updateStatus = signal<AppUpdateStatus>({ kind: 'idle' });
    install = vi.fn(() => Promise.resolve('accepted' as const));
    check = vi.fn(() => Promise.resolve());
    fakeLogger = loggerFake();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AboutSectionComponent],
      providers: [
        {
          provide: InstallPromptService,
          useValue: {
            isStandalone: standalone.asReadonly(),
            canInstall: canInstall.asReadonly(),
            install,
          },
        },
        {
          provide: AppUpdateStore,
          useValue: { status: updateStatus.asReadonly(), check },
        },
        { provide: LOGGER, useValue: fakeLogger.logger },
        { provide: DATABASE_SCHEMA_VERSION, useValue: 5 },
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(AboutSectionComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('keeps the install state visible while hiding Install when unavailable', () => {
    const element = render();

    expect(element.textContent).toContain('Not installed');
    expect(element.querySelector('button')?.textContent).toContain('Check for updates');
    expect(element.textContent).not.toContain('Install Monosai');
  });

  it('shows feedback when the update check finds the current version', () => {
    const fixture = TestBed.createComponent(AboutSectionComponent);
    fixture.detectChanges();

    updateStatus.set({ kind: 'current' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('You’re up to date.');
  });

  it('shows Install only while installation is possible and the app is not standalone', () => {
    const fixture = TestBed.createComponent(AboutSectionComponent);
    canInstall.set(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Install Monosai');

    standalone.set(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Install Monosai');
  });

  it('copies the current log buffer and reports success', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = TestBed.createComponent(AboutSectionComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Copy diagnostics"]')
      ?.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Diagnostics copied.');
    expect(fakeLogger.info).toHaveBeenCalledWith('diagnostics.copy.succeeded', { count: 1 });
  });

  it('reports clipboard failures without exposing a raw error', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('clipboard secret')));
    const documentRef = TestBed.inject(DOCUMENT);
    Object.defineProperty(documentRef.defaultView?.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fixture = TestBed.createComponent(AboutSectionComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Copy diagnostics"]')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Diagnostics could not be copied on this browser.',
    );
    expect(fakeLogger.warn).toHaveBeenCalledWith('diagnostics.copy.failed');
    expect(fakeLogger.warn).not.toHaveBeenCalledWith('diagnostics.copy.failed', expect.anything());
  });

  it('clears the buffer without persisting a log table', () => {
    const element = render();
    element.querySelector<HTMLButtonElement>('button[aria-label="Clear diagnostics"]')?.click();

    expect(fakeLogger.clear).toHaveBeenCalledOnce();
  });
});
