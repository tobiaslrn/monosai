import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageStore } from '../../application/settings/storage.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { ConfirmDialogData } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { StartupFailureComponent } from './startup-failure.component';

describe('StartupFailureComponent', () => {
  const failure = signal<StorageError | null>(null);
  const storage = {
    action: signal('idle'),
    failure,
    clearFailure: vi.fn(() => {
      failure.set(null);
    }),
    exportData: vi.fn<() => Promise<Blob | null>>(),
    resetAllData: vi.fn<() => Promise<boolean>>(),
  };
  const dialog = { open: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    failure.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: StorageStore, useValue: storage },
        { provide: Dialog, useValue: dialog },
        { provide: CLOCK, useValue: fixedClock(Date.UTC(2026, 9, 31)) },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function render(resetMayHelp: boolean): ComponentFixture<StartupFailureComponent> {
    const fixture = TestBed.createComponent(StartupFailureComponent);
    fixture.componentRef.setInput('failure', {
      error: storageError('migration-failed', 'The stored database could not be upgraded.'),
      resetMayHelp,
    });
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ComponentFixture<StartupFailureComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function labels(fixture: ComponentFixture<StartupFailureComponent>): readonly string[] {
    return Array.from(element(fixture).querySelectorAll('button')).map((button) =>
      button.textContent.trim(),
    );
  }

  function press(fixture: ComponentFixture<StartupFailureComponent>, name: string): void {
    const button = Array.from(element(fixture).querySelectorAll('button')).find((candidate) =>
      candidate.textContent.includes(name),
    );
    if (button === undefined) {
      throw new Error(`no ${name} button`);
    }
    button.click();
  }

  it('offers only a retry when the data is not the problem', () => {
    expect(labels(render(false))).toEqual(['Try again']);
  });

  it('offers a copy before the reset when the data is the problem', () => {
    const fixture = render(true);

    expect(element(fixture).textContent).toContain('The stored database could not be upgraded.');
    expect(labels(fixture)).toEqual([
      'Try again',
      'Save a copy of my data',
      'Delete all Monosai data',
    ]);
  });

  it('deletes nothing unless the confirmation is accepted, and names what goes', async () => {
    dialog.open.mockReturnValue({ closed: of(false) });
    const fixture = render(true);

    press(fixture, 'Delete all');
    await fixture.whenStable();

    const data = (dialog.open.mock.calls[0]?.[1] as { readonly data: ConfirmDialogData }).data;
    expect(data.tone).toBe('danger');
    expect(data.details?.join(' ')).toContain('Every story');
    expect(data.details?.join(' ')).toContain('API key');
    expect(data.footnote).toContain('Anki');
    expect(data.footnote).toContain('cannot load a saved copy back');
    expect(storage.resetAllData).not.toHaveBeenCalled();
  });

  it('resets after the confirmation and shows a reset that failed', async () => {
    dialog.open.mockReturnValue({ closed: of(true) });
    storage.resetAllData.mockImplementation(() => {
      failure.set(storageError('unavailable', 'Browser storage is unavailable.'));
      return Promise.resolve(false);
    });
    const fixture = render(true);

    press(fixture, 'Delete all');
    await vi.waitFor(() => {
      expect(storage.resetAllData).toHaveBeenCalledOnce();
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element(fixture).querySelector('.mn-notice')?.textContent).toContain(
      'Browser storage is unavailable.',
    );
    expect(element(fixture).textContent).not.toContain('have not been changed');
  });

  it('forgets an earlier export or reset failure when trying again', () => {
    failure.set(storageError('unavailable', 'Browser storage is unavailable.'));
    const fixture = render(true);
    const retried = vi.fn();
    fixture.componentRef.instance.retry.subscribe(retried);
    expect(element(fixture).querySelector('.mn-notice')).not.toBeNull();

    press(fixture, 'Try again');
    fixture.detectChanges();

    expect(element(fixture).querySelector('.mn-notice')).toBeNull();
    expect(retried).toHaveBeenCalledOnce();
  });

  it('downloads the exported file under a dated name', async () => {
    storage.exportData.mockResolvedValue(new Blob(['{}']));
    window.URL.createObjectURL = vi.fn(() => 'blob:copy');
    window.URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const fixture = render(true);

    press(fixture, 'Save a copy');
    await vi.waitFor(() => {
      expect(click).toHaveBeenCalledOnce();
    });

    expect(names).toEqual(['monosai-data-2026-10-31.json']);
  });
});
