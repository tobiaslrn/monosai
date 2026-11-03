import { inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { CredentialStore } from '../../application/settings/credential.store';
import { GenerationSettingsStore } from '../../application/settings/generation-settings.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { StorageFailure } from '../../domain/storage/storage-error';
import { ENGINE_CLIENT } from '../../engine/engine-client';
import { EngineFailure } from '../../engine/engine-failure';
import {
  MonosaiDatabase,
  assertStoredSchemaNotNewer,
} from '../../infrastructure/persistence/monosai-db';
import { mapStorageFailure } from '../../infrastructure/persistence/storage-error-mapper';
import { INITIALIZATION_STEP, type InitializationStep } from './initialization-step';

/**
 * Startup sequence: boot the engine, open the database (running migrations
 * transactionally), then load settings. The engine goes first: while another
 * tab's engine owns the data, this tab stops before it touches anything. Navigation renders only after both succeed; a failure
 * routes to the recovery screen instead of deleting data or reloading.
 */
export function provideInitializationSteps() {
  return {
    provide: INITIALIZATION_STEP,
    useFactory: (): readonly InitializationStep[] => {
      const engine = inject(ENGINE_CLIENT);
      const database = inject(MonosaiDatabase);
      const settings = inject(AppSettingsStore);
      const credential = inject(CredentialStore);
      const generationSettings = inject(GenerationSettingsStore);
      const textModel = inject(TextModelStore);
      const tts = inject(TtsStore);
      const updates = inject(AppUpdateStore);
      let watching = false;

      return [
        {
          name: 'engine',
          run: async () => {
            const result = await engine.call({ type: 'ping' });
            if (!result.ok) {
              throw new EngineFailure(result.error);
            }
          },
        },
        {
          name: 'database',
          run: async () => {
            await assertStoredSchemaNotNewer(database.name);
            try {
              await database.open();
              if (!watching) {
                watching = true;
                database.onLoss((cause) => {
                  updates.reportDatabaseLost(cause);
                });
              }
            } catch (thrown) {
              if (thrown instanceof StorageFailure) {
                throw thrown;
              }
              throw new StorageFailure(mapStorageFailure(thrown, 'database.open'));
            }
          },
        },
        {
          name: 'settings',
          run: () => settings.load(),
        },
        {
          name: 'generation-settings',
          run: () => generationSettings.load(),
        },
        // Model configuration is app-wide state. Loading it before routes
        // render prevents a route's asynchronous reload from replacing a
        // selection that was just written while navigating.
        {
          name: 'credential',
          run: () => credential.load(),
        },
        {
          name: 'text-model',
          run: () => textModel.load(),
        },
        {
          name: 'tts',
          run: () => tts.load(),
        },
      ];
    },
  };
}
