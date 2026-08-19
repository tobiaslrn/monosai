import { DOCUMENT, inject, type Provider } from '@angular/core';
import { systemClock, type Clock } from '../../domain/shared/clock';
import type { IdGenerator } from '../../domain/shared/ids';
import type { RandomSource } from '../../domain/shared/random';
import {
  CLOCK,
  CREDENTIAL_REPOSITORY,
  DATABASE_SCHEMA_VERSION,
  ENRICHMENT_REPOSITORY,
  GRAMMAR_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  RANDOM_SOURCE,
  READING_REPOSITORY,
  SETTINGS_REPOSITORY,
  SOURCE_MAPPING_REPOSITORY,
  STORAGE_MAINTENANCE,
  VOCABULARY_REPOSITORY,
} from '../../application/shared/repository-tokens';
import { sha256Hasher } from '../hashing/sha256-hasher';
import {
  BrowserStorageMaintenance,
  resolveMaintenanceDependencies,
} from './browser-storage-maintenance';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { MonosaiDatabase } from './monosai-db';
import { DexieCredentialRepository } from './repositories/dexie-credential.repository';
import { DexieEnrichmentRepository } from './repositories/dexie-enrichment.repository';
import { DexieGrammarRepository } from './repositories/dexie-grammar.repository';
import { DexieJobRepository } from './repositories/dexie-job.repository';
import { DexieReadingRepository } from './repositories/dexie-reading.repository';
import { DexieSettingsRepository } from './repositories/dexie-settings.repository';
import { DexieSourceMappingRepository } from './repositories/dexie-source-mapping.repository';
import { DexieVocabularyRepository } from './repositories/dexie-vocabulary.repository';

const cryptoIdGenerator: IdGenerator = {
  nextId: () => crypto.randomUUID(),
};

/**
 * Cryptographically adequate randomness, as the specification requires for the
 * suggestion palette.
 *
 * Rejection sampling removes the modulo bias a plain remainder would leave, so
 * the last few vocabulary items are not quietly less likely to be suggested
 * than the first few.
 */
const cryptoRandomSource: RandomSource = {
  nextInt: (exclusiveMax: number): number => {
    if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
      throw new RangeError('nextInt requires a positive integer bound');
    }
    const limit = Math.floor(0x1_0000_0000 / exclusiveMax) * exclusiveMax;
    const buffer = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buffer);
      if (buffer[0] < limit) {
        return buffer[0] % exclusiveMax;
      }
    }
  },
};

/** Binds every domain port to its Dexie-backed implementation. */
export function providePersistence(): Provider[] {
  return [
    { provide: CLOCK, useValue: systemClock },
    { provide: DATABASE_SCHEMA_VERSION, useValue: CURRENT_SCHEMA_VERSION },
    { provide: HASHER, useValue: sha256Hasher },
    { provide: ID_GENERATOR, useValue: cryptoIdGenerator },
    { provide: RANDOM_SOURCE, useValue: cryptoRandomSource },
    { provide: MonosaiDatabase, useFactory: () => new MonosaiDatabase() },
    {
      provide: SETTINGS_REPOSITORY,
      useFactory: () => new DexieSettingsRepository(inject(MonosaiDatabase), inject<Clock>(CLOCK)),
    },
    {
      provide: CREDENTIAL_REPOSITORY,
      useFactory: () =>
        new DexieCredentialRepository(inject(MonosaiDatabase), inject<Clock>(CLOCK)),
    },
    {
      provide: READING_REPOSITORY,
      useFactory: () => new DexieReadingRepository(inject(MonosaiDatabase), inject<Clock>(CLOCK)),
    },
    {
      provide: VOCABULARY_REPOSITORY,
      useFactory: () => new DexieVocabularyRepository(inject(MonosaiDatabase)),
    },
    {
      provide: SOURCE_MAPPING_REPOSITORY,
      useFactory: () => new DexieSourceMappingRepository(inject(MonosaiDatabase)),
    },
    {
      provide: GRAMMAR_REPOSITORY,
      useFactory: () => new DexieGrammarRepository(inject(MonosaiDatabase), inject<Clock>(CLOCK)),
    },
    {
      provide: ENRICHMENT_REPOSITORY,
      useFactory: () => new DexieEnrichmentRepository(inject(MonosaiDatabase)),
    },
    {
      provide: JOB_REPOSITORY,
      useFactory: () => new DexieJobRepository(inject(MonosaiDatabase), inject<Clock>(CLOCK)),
    },
    {
      provide: STORAGE_MAINTENANCE,
      useFactory: () => {
        const view = inject(DOCUMENT).defaultView;
        const dependencies = resolveMaintenanceDependencies(view);
        return new BrowserStorageMaintenance(
          inject(MonosaiDatabase),
          dependencies.navigatorRef,
          dependencies.caches,
        );
      },
    },
  ];
}
