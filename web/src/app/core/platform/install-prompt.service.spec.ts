import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InstallPromptService } from './install-prompt.service';

function dispatchBeforeInstallPrompt(): { prevented: boolean } {
  const state = { prevented: false };
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = () => Promise.resolve();
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  state.prevented = event.defaultPrevented;
  return state;
}

describe('InstallPromptService', () => {
  it('cannot install before the browser has offered a prompt', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(InstallPromptService);

    expect(service.canInstall()).toBe(false);
  });

  it('captures beforeinstallprompt, prevents the default mini-infobar, and can install', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(InstallPromptService);

    const { prevented } = dispatchBeforeInstallPrompt();
    expect(prevented).toBe(true);
    expect(service.canInstall()).toBe(true);

    const outcome = await service.install();
    expect(outcome).toBe('accepted');
    expect(service.canInstall()).toBe(false);
  });

  it('reports unavailable when installing with nothing captured', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(InstallPromptService);

    expect(await service.install()).toBe('unavailable');
  });

  it('clears the captured prompt and marks itself installed on appinstalled', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(InstallPromptService);
    dispatchBeforeInstallPrompt();
    expect(service.canInstall()).toBe(true);

    window.dispatchEvent(new Event('appinstalled'));

    expect(service.canInstall()).toBe(false);
  });
});
