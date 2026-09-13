import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { AlphaNoticeDialogData } from '../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component';
import { ALPHA_DIALOG_OPENER, AlphaNoticeService } from './alpha-notice.service';

describe('AlphaNoticeService', () => {
  function configure(seen = false) {
    const open = vi.fn<(data: AlphaNoticeDialogData) => Promise<void>>(() => Promise.resolve());
    const settings = {
      alphaNoticeSeen: vi.fn().mockReturnValue(seen),
      markAlphaNoticeSeen: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        AlphaNoticeService,
        { provide: ALPHA_DIALOG_OPENER, useValue: { open } },
        { provide: AppSettingsStore, useValue: settings },
      ],
    });
    return { service: TestBed.inject(AlphaNoticeService), open, settings };
  }

  it('opens a blocking alert dialog once when the acknowledgment is not saved', async () => {
    const { service, open } = configure();

    await service.offer();
    await service.offer();

    expect(open).toHaveBeenCalledOnce();
    const data = open.mock.calls[0][0];
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
    const data = open.mock.calls[0][0];

    expect(await data.acknowledge()).toBe(true);
    expect(settings.markAlphaNoticeSeen).toHaveBeenCalledOnce();
  });
});
