import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeCredentialRepository, failingCredentials } from '../../../testing/ai-fakes';
import type { CredentialRepository } from '../../domain/settings/credential-repository';
import { CREDENTIAL_REPOSITORY } from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';

const KEY = 'sk-or-v1-example';

function createStore(repository: CredentialRepository): CredentialStore {
  TestBed.configureTestingModule({
    providers: [CredentialStore, { provide: CREDENTIAL_REPOSITORY, useValue: repository }],
  });
  return TestBed.inject(CredentialStore);
}

describe('CredentialStore', () => {
  let repository: FakeCredentialRepository;

  beforeEach(() => {
    repository = new FakeCredentialRepository(null);
  });

  it('starts not configured', async () => {
    const store = createStore(repository);

    await store.load();

    expect(store.isConfigured()).toBe(false);
    expect(store.status().updatedAt).toBeNull();
  });

  it('reports a saved key without exposing it', async () => {
    const store = createStore(repository);

    await expect(store.save(KEY)).resolves.toBe(true);

    expect(store.isConfigured()).toBe(true);
    expect(JSON.stringify(store.status())).not.toContain(KEY);
  });

  it('keeps the key out of every signal the store exposes', async () => {
    const store = createStore(repository);

    await store.save(KEY);

    const exposed = JSON.stringify({
      status: store.status(),
      action: store.action(),
      failure: store.failure(),
      keyGeneration: store.keyGeneration(),
    });
    expect(exposed).not.toContain(KEY);
    expect(exposed).not.toContain('sk-or');
  });

  it('moves the key generation on replace and on removal', async () => {
    const store = createStore(repository);
    await store.save(KEY);
    const first = store.keyGeneration();

    await store.save('sk-or-v1-second');
    const second = store.keyGeneration();
    expect(second).not.toBe(first);

    await store.remove();
    expect(store.keyGeneration()).not.toBe(second);
  });

  it('reads as not configured after removal', async () => {
    const store = createStore(repository);
    await store.save(KEY);

    await expect(store.remove()).resolves.toBe(true);

    expect(store.isConfigured()).toBe(false);
  });

  it('rejects an empty key without changing the stored state', async () => {
    const store = createStore(repository);
    await store.save(KEY);

    await expect(store.save('   ')).resolves.toBe(false);

    expect(store.isConfigured()).toBe(true);
    expect(store.failure()?.code).toBe('conflict');
  });

  it('surfaces a storage failure and returns to idle', async () => {
    const store = createStore(failingCredentials('unavailable'));

    await expect(store.save(KEY)).resolves.toBe(false);

    expect(store.failure()?.code).toBe('unavailable');
    expect(store.action()).toBe('idle');
  });

  it('surfaces a failed read without claiming a key exists', async () => {
    const store = createStore(failingCredentials('corrupt-record'));

    await store.load();

    expect(store.isConfigured()).toBe(false);
    expect(store.failure()?.code).toBe('corrupt-record');
  });
});
