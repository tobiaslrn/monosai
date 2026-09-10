import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { InstallPromptService } from '../../core/platform/install-prompt.service';
import { AppSectionComponent } from './app-section.component';

describe('AppSectionComponent', () => {
  const standalone = signal(false);
  const canInstall = signal(false);
  const updateStatus = signal({ kind: 'idle' as const });
  const install = vi.fn(() => Promise.resolve('accepted' as const));
  const check = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    standalone.set(false);
    canInstall.set(false);
    updateStatus.set({ kind: 'idle' });
    install.mockClear();
    check.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppSectionComponent],
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
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(AppSectionComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('keeps the Installed fact while hiding Install when the browser cannot install', () => {
    const element = render();

    expect(element.textContent).toContain('Installed');
    expect(element.querySelector('button')?.textContent).toContain('Check for updates');
    expect(element.textContent).not.toContain('Install Monosai');
  });

  it('shows Install only while installation is possible and the app is not standalone', () => {
    const fixture = TestBed.createComponent(AppSectionComponent);
    canInstall.set(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Install Monosai');

    standalone.set(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Install Monosai');
  });
});
