import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StubAiSettingsRepository } from '../../../testing/ai-fakes';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { storageError } from '../../domain/storage/storage-error';
import { CLOCK, HASHER, SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { ExceptionPolicyStore, MAX_POLICY_LENGTH } from './exception-policy.store';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

describe('ExceptionPolicyStore', () => {
  let settings: StubAiSettingsRepository;

  beforeEach(() => {
    settings = new StubAiSettingsRepository();
    TestBed.configureTestingModule({
      providers: [
        ExceptionPolicyStore,
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  async function ready(): Promise<ExceptionPolicyStore> {
    const store = TestBed.inject(ExceptionPolicyStore);
    await store.load();
    return store;
  }

  it('starts empty with no hash', async () => {
    const store = await ready();

    expect(store.draft()).toBe('');
    expect(store.policy().policyHash).toBe('');
  });

  it('saves normalized text with a hash and a timestamp', async () => {
    const store = await ready();

    store.setDraft('  Allow proper nouns.  \n\n');
    await expect(store.save()).resolves.toBe(true);

    expect(settings.policy.text).toBe('Allow proper nouns.');
    expect(settings.policy.policyHash).not.toBe('');
    expect(settings.policy.updatedAt).toBe(1_700_000_000_000);
    expect(store.justSaved()).toBe(true);
  });

  it('leaves the hash empty when the policy is cleared', async () => {
    const store = await ready();
    store.setDraft('Allow proper nouns.');
    await store.save();

    store.setDraft('   ');
    await store.save();

    expect(settings.policy.text).toBe('');
    expect(settings.policy.policyHash).toBe('');
  });

  it('does not treat cosmetic edits as unsaved changes', async () => {
    const store = await ready();
    store.setDraft('Allow proper nouns.');
    await store.save();

    store.setDraft('Allow proper nouns.\n\n');

    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('reports an edit as unsaved and clears the saved marker', async () => {
    const store = await ready();
    store.setDraft('Allow proper nouns.');
    await store.save();

    store.setDraft('Allow proper nouns and numbers.');

    expect(store.hasUnsavedChanges()).toBe(true);
    expect(store.justSaved()).toBe(false);
  });

  it('refuses to save a policy past the length limit', async () => {
    const store = await ready();

    store.setDraft('x'.repeat(MAX_POLICY_LENGTH + 1));

    expect(store.isTooLong()).toBe(true);
    await expect(store.save()).resolves.toBe(false);
    expect(settings.policy.text).toBe('');
  });

  it('surfaces a storage failure without claiming to have saved', async () => {
    const store = await ready();
    settings.failWrites = storageError('quota', 'no room');

    store.setDraft('Allow proper nouns.');
    await expect(store.save()).resolves.toBe(false);

    expect(store.failure()?.code).toBe('quota');
    expect(store.justSaved()).toBe(false);
  });

  it('surfaces a failed read', async () => {
    settings.failReads = storageError('corrupt-record', 'bad row');
    const store = await ready();

    expect(store.failure()?.code).toBe('corrupt-record');
  });
});
