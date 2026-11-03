import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { CredentialStore } from '../../application/settings/credential.store';
import { GenerationSettingsStore } from '../../application/settings/generation-settings.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { FakeEngineClient } from '../../../testing/engine-fakes';
import { StorageFailure } from '../../domain/storage/storage-error';
import { ENGINE_CLIENT } from '../../engine/engine-client';
import { EngineFailure } from '../../engine/engine-failure';
import { CURRENT_SCHEMA_VERSION } from '../../infrastructure/persistence/migrations';
import { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { INITIALIZATION_STEP } from './initialization-step';
import { provideInitializationSteps } from './initialization-steps';

describe('startup database step', () => {
  const loader = { load: vi.fn(() => Promise.resolve()) };
  const updates = { reportDatabaseLost: vi.fn() };
  let name = '';

  afterEach(async () => {
    TestBed.inject(MonosaiDatabase).close();
    await Dexie.delete(name);
    vi.clearAllMocks();
  });

  function databaseStep(): { run(): Promise<void> } {
    name = `monosai-steps-${Date.now()}`;
    TestBed.configureTestingModule({
      providers: [
        provideInitializationSteps(),
        { provide: MonosaiDatabase, useFactory: () => new MonosaiDatabase(name) },
        { provide: AppSettingsStore, useValue: loader },
        { provide: CredentialStore, useValue: loader },
        { provide: GenerationSettingsStore, useValue: loader },
        { provide: TextModelStore, useValue: loader },
        { provide: TtsStore, useValue: loader },
        { provide: AppUpdateStore, useValue: updates },
        { provide: ENGINE_CLIENT, useValue: new FakeEngineClient() },
      ],
    });
    const step = TestBed.inject(INITIALIZATION_STEP).find((entry) => entry.name === 'database');
    if (step === undefined) {
      throw new Error('no database step');
    }
    return step;
  }

  function writeNative(version: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('futureStore', { keyPath: 'id' });
      };
      request.onerror = () => {
        reject(new Error('could not seed'));
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
  }

  it('refuses a database from a newer build before opening it', async () => {
    const step = databaseStep();
    await writeNative(CURRENT_SCHEMA_VERSION * 10 + 10);
    const open = vi.spyOn(TestBed.inject(MonosaiDatabase), 'open');

    const thrown = await step.run().then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(thrown).toBeInstanceOf(StorageFailure);
    expect((thrown as StorageFailure).storageError.code).toBe('newer-version');
    expect(open).not.toHaveBeenCalled();
  });

  it('tells the update store when another tab takes the database away', async () => {
    const step = databaseStep();
    await step.run();

    await writeNative(CURRENT_SCHEMA_VERSION * 10 + 10);

    expect(updates.reportDatabaseLost).toHaveBeenCalledTimes(1);
    expect(updates.reportDatabaseLost).toHaveBeenCalledWith('another-tab');
  });

  it('watches the database once however often startup is retried', async () => {
    const step = databaseStep();
    await step.run();
    TestBed.inject(MonosaiDatabase).close();
    await step.run();

    await writeNative(CURRENT_SCHEMA_VERSION * 10 + 10);

    expect(updates.reportDatabaseLost).toHaveBeenCalledTimes(1);
  });
});

describe('startup engine step', () => {
  function steps(engine: FakeEngineClient): readonly { name: string; run(): Promise<void> }[] {
    const loader = { load: vi.fn(() => Promise.resolve()) };
    TestBed.configureTestingModule({
      providers: [
        provideInitializationSteps(),
        { provide: ENGINE_CLIENT, useValue: engine },
        // The engine step runs before the database is used; this one is never opened.
        { provide: MonosaiDatabase, useValue: {} },
        { provide: AppSettingsStore, useValue: loader },
        { provide: CredentialStore, useValue: loader },
        { provide: GenerationSettingsStore, useValue: loader },
        { provide: TextModelStore, useValue: loader },
        { provide: TtsStore, useValue: loader },
        { provide: AppUpdateStore, useValue: { reportDatabaseLost: vi.fn() } },
      ],
    });
    return TestBed.inject(INITIALIZATION_STEP);
  }

  it('runs first, before anything touches the database', () => {
    expect(steps(new FakeEngineClient()).map((step) => step.name)[0]).toBe('engine');
  });

  it('pings the engine and passes once it answers', async () => {
    const engine = new FakeEngineClient();
    const [step] = steps(engine);

    await step?.run();

    expect(engine.calls).toEqual([{ type: 'ping' }]);
  });

  it('stops startup with the engine error when the engine refuses', async () => {
    const engine = new FakeEngineClient();
    const refusal = {
      domain: 'engine',
      code: 'open-in-another-tab',
      message: 'Monosai is open in another tab',
    } as const;
    engine.failWith(refusal);
    const [step] = steps(engine);

    const thrown = await step?.run().then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(thrown).toBeInstanceOf(EngineFailure);
    expect((thrown as EngineFailure).error).toEqual(refusal);
  });
});
