import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  UNKNOWN_PERSISTENCE,
  type PersistenceStatus,
} from '../../domain/storage/persistence-status';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import { STORAGE_MAINTENANCE } from '../shared/repository-tokens';
import { StorageStore } from './storage.store';

const GRANTED: PersistenceStatus = {
  supported: true,
  persisted: true,
  canRequest: false,
  usageBytes: 1024,
  quotaBytes: 4096,
};
const ASKABLE: PersistenceStatus = { ...GRANTED, persisted: false, canRequest: true };
const UNSUPPORTED: PersistenceStatus = { ...UNKNOWN_PERSISTENCE, usageBytes: 1024 };

class StubMaintenance implements StorageMaintenance {
  status: Result<PersistenceStatus, StorageError> = ok(ASKABLE);
  request: Result<PersistenceStatus, StorageError> = ok(ASKABLE);

  getPersistenceStatus(): Promise<Result<PersistenceStatus, StorageError>> {
    return Promise.resolve(this.status);
  }

  requestPersistence(): Promise<Result<PersistenceStatus, StorageError>> {
    return Promise.resolve(this.request);
  }

  clearAudioCache(): Promise<Result<void, StorageError>> {
    return Promise.resolve(ok(undefined));
  }

  clearReadingAudio(): Promise<Result<void, StorageError>> {
    return Promise.resolve(ok(undefined));
  }

  resetAllData(): Promise<Result<void, StorageError>> {
    return Promise.resolve(ok(undefined));
  }
}

/**
 * Storage protection is four different answers, and the store used to keep
 * one boolean. A refusal in particular has to be distinguishable from never
 * having asked, or a learner presses the same button again forever.
 */
describe('StorageStore persistence', () => {
  let maintenance: StubMaintenance;
  let store: StorageStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    maintenance = new StubMaintenance();
    TestBed.configureTestingModule({
      providers: [StorageStore, { provide: STORAGE_MAINTENANCE, useValue: maintenance }],
    });
    store = TestBed.inject(StorageStore);
  });

  it('starts from unknown until the status has been read', () => {
    expect(store.persistence()).toBe('unknown');
  });

  it('reads a browser that can be asked as not asked yet', async () => {
    await store.refresh();

    expect(store.persistence()).toBe('not-asked');
  });

  it('reads a browser with no storage protection as unsupported', async () => {
    maintenance.status = ok(UNSUPPORTED);

    await store.refresh();

    expect(store.persistence()).toBe('unsupported');
  });

  it('records a grant', async () => {
    maintenance.request = ok(GRANTED);

    await store.requestPersistence();

    expect(store.persistence()).toBe('granted');
    expect(store.status().persisted).toBe(true);
  });

  it('records a refusal rather than reporting nothing', async () => {
    await store.refresh();
    await store.requestPersistence();

    expect(store.persistence()).toBe('refused');
    expect(store.status().canRequest).toBe(true);
  });

  it('keeps a refusal through an unrelated refresh', async () => {
    await store.requestPersistence();

    await store.refresh();

    expect(store.persistence()).toBe('refused');
  });

  it('reports a failed request with the reason, and changes nothing else', async () => {
    maintenance.request = err(storageError('unavailable', 'Storage is not available.'));

    await store.requestPersistence();

    expect(store.persistence()).toBe('request-failed');
    expect(store.failure()?.message).toBe('Storage is not available.');
    expect(store.action()).toBe('idle');
  });

  it('reports a failed status read without claiming the browser refuses', async () => {
    maintenance.status = err(storageError('unavailable', 'Storage is not available.'));

    await store.refresh();

    expect(store.persistence()).toBe('unknown');
    expect(store.status()).toEqual(UNKNOWN_PERSISTENCE);
  });
});
