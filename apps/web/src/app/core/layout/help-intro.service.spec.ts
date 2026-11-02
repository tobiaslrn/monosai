import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { HelpIntroService } from './help-intro.service';

describe('HelpIntroService', () => {
  const seen = signal(false);
  const save = vi.fn<() => Promise<boolean>>();
  let service: HelpIntroService;
  beforeEach(() => {
    seen.set(false);
    save.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        HelpIntroService,
        { provide: AppSettingsStore, useValue: { helpIntroSeen: seen, markHelpIntroSeen: save } },
      ],
    });
    service = TestBed.inject(HelpIntroService);
  });
  it('offers inline help once without opening a dialog', async () => {
    service.offer();
    expect(service.visible()).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await service.finish('dismiss');
    service.offer();
    expect(service.visible()).toBe(false);
    expect(save).toHaveBeenCalledOnce();
  });
  it('respects the saved dismissal and only navigates when the guide is requested', async () => {
    seen.set(true);
    service.offer();
    expect(service.visible()).toBe(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await service.finish('guide');
    expect(navigate).toHaveBeenCalledWith('/help');
  });
  it('allows retrying a failed preference write without reopening help', async () => {
    save.mockResolvedValueOnce(false);
    service.offer();
    await service.finish('dismiss');
    expect(service.saveFailed()).toBe(true);
    expect(service.visible()).toBe(false);
    await service.retrySave();
    expect(service.saveFailed()).toBe(false);
  });
});
