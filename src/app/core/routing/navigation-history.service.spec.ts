import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavigationHistoryService,
  navigationOriginState,
  readNavigationOrigin,
} from './navigation-history.service';

describe('NavigationHistoryService', () => {
  const back = vi.fn();
  const navigateByUrl = vi.fn<(url: string) => Promise<boolean>>();
  let service: NavigationHistoryService;

  beforeEach(() => {
    back.mockReset();
    navigateByUrl.mockReset();
    navigateByUrl.mockResolvedValue(true);
    history.replaceState(null, '');
    TestBed.configureTestingModule({
      providers: [
        { provide: Location, useValue: { back } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    service = TestBed.inject(NavigationHistoryService);
  });

  afterEach(() => {
    history.replaceState(null, '');
  });

  it('pops browser history when the current entry proves the expected origin', async () => {
    history.replaceState(navigationOriginState('/library'), '');

    await service.backOrNavigate('/library');

    expect(back).toHaveBeenCalledOnce();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('uses an internal fallback for a direct link without trusted history', async () => {
    await service.backOrNavigate('/settings');

    expect(back).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/settings');
  });

  it('does not pop to a different marked origin', async () => {
    history.replaceState(navigationOriginState('/generate'), '');

    await service.backOrNavigate('/settings');

    expect(back).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/settings');
  });

  it('preserves a trusted origin only across its matching replace transition', () => {
    history.replaceState(navigationOriginState('/library'), '');

    expect(service.preservedOriginState('/library')).toEqual(navigationOriginState('/library'));
    expect(service.preservedOriginState('/generate')).toBeUndefined();
  });
});

describe('navigation origin validation', () => {
  it('rejects external and malformed origins', () => {
    expect(readNavigationOrigin({ monosaiNavigationOrigin: 'https://example.com' })).toBeNull();
    expect(readNavigationOrigin({ monosaiNavigationOrigin: '/reader/not/a/route' })).toBeNull();
    expect(() => navigationOriginState('//example.com')).toThrow(/Unsafe navigation origin/);
  });
});
