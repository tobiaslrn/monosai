import { inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { mapStorageFailure } from '../../infrastructure/persistence/storage-error-mapper';
import { INITIALIZATION_STEP, type InitializationStep } from './initialization-step';

/**
 * Startup sequence: open the database (running migrations transactionally),
 * then load settings. Navigation renders only after both succeed; a failure
 * routes to the recovery screen instead of deleting data or reloading.
 */
export function provideInitializationSteps() {
  return {
    provide: INITIALIZATION_STEP,
    useFactory: (): readonly InitializationStep[] => {
      const database = inject(MonosaiDatabase);
      const settings = inject(AppSettingsStore);
      const credential = inject(CredentialStore);
      const textModel = inject(TextModelStore);
      const tts = inject(TtsStore);

      return [
        {
          name: 'database',
          run: async () => {
            try {
              await database.open();
            } catch (thrown) {
              throw new Error(mapStorageFailure(thrown, 'database.open').message, {
                cause: thrown,
              });
            }
          },
        },
        {
          name: 'settings',
          run: () => settings.load(),
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
