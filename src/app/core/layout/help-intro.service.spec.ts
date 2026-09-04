import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  it('does not offer an introduction already seen', () => {
    seen.set(true);
    service.offer();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
  });

  it.each(['Got it', 'Read the guide', 'escape', 'backdrop'])(
    'persists dismissal through %s and only navigates for the guide',
    async (action) => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      service.offer();
      TestBed.tick();
      expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
      if (action === 'escape') {
        const key = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
        document.querySelector('[role="dialog"]')!.dispatchEvent(key);
      } else if (action === 'backdrop') {
        document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
      } else {
        [...document.querySelectorAll<HTMLButtonElement>('mn-help-intro-dialog button')]
          .find((button) => button.textContent.includes(action))!
          .click();
      }
      await vi.waitFor(() => {
        expect(save).toHaveBeenCalledOnce();
      });
      if (action === 'Read the guide') {
        await vi.waitFor(() => {
          expect(navigate).toHaveBeenCalledWith('/help');
        });
      } else {
        expect(navigate).not.toHaveBeenCalled();
      }
      service.offer();
      expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    },
  );

  it('offers a retry when persistence fails without offering another dialog', async () => {
    save.mockResolvedValueOnce(false);
    service.offer();
    TestBed.inject(Dialog).closeAll();
    await vi.waitFor(() => {
      expect(service.saveFailed()).toBe(true);
    });
    service.offer();
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(0);
    await service.retrySave();
    expect(service.saveFailed()).toBe(false);
  });
});
