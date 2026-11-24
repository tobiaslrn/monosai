import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { appConfig } from './app.config';
import { LanguageStore } from './application/language/language.store';
import { AudioCompressionStore } from './application/settings/audio-compression.store';
import { AutomaticAnkiSyncCoordinator } from './application/vocabulary/automatic-anki-sync.coordinator';
import { AppInitializerService } from './core/bootstrap/app-initializer.service';
import { INITIALIZATION_STEP } from './core/bootstrap/initialization-step';
import { ThemeSynchronizer } from './core/platform/theme-synchronizer.service';

describe('appConfig startup', () => {
  it('starts the post-start work when Try again succeeds after a failed start', async () => {
    let attempts = 0;
    const start = vi.fn();
    const initialize = vi.fn(() => Promise.resolve());
    const compress = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        {
          provide: INITIALIZATION_STEP,
          useValue: [
            {
              name: 'database',
              run: () => {
                attempts += 1;
                return attempts === 1 ? Promise.reject(new Error('transient')) : Promise.resolve();
              },
            },
          ],
        },
        { provide: ThemeSynchronizer, useValue: {} },
        { provide: AutomaticAnkiSyncCoordinator, useValue: { start } },
        { provide: LanguageStore, useValue: { initialize } },
        { provide: AudioCompressionStore, useValue: { run: compress } },
      ],
    });
    const initializer = TestBed.inject(AppInitializerService);
    await vi.waitFor(() => {
      expect(initializer.state().status).toBe('failed');
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const tryAgain = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent.trim() === 'Try again');
    expect(tryAgain).toBeDefined();
    tryAgain!.click();
    // Only the startup work matters here, not the shell that renders once ready.
    fixture.destroy();
    await vi.waitFor(() => {
      expect(initializer.state().status).toBe('ready');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(start).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(compress).toHaveBeenCalledTimes(1);
  });
  it('starts the post-start work after a clean start', async () => {
    const start = vi.fn();
    const initialize = vi.fn(() => Promise.resolve());
    const compress = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        { provide: INITIALIZATION_STEP, useValue: [] },
        { provide: ThemeSynchronizer, useValue: {} },
        { provide: AutomaticAnkiSyncCoordinator, useValue: { start } },
        { provide: LanguageStore, useValue: { initialize } },
        { provide: AudioCompressionStore, useValue: { run: compress } },
      ],
    });
    const initializer = TestBed.inject(AppInitializerService);
    await vi.waitFor(() => {
      expect(initializer.state().status).toBe('ready');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(start).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(compress).toHaveBeenCalledTimes(1);
  });
});
