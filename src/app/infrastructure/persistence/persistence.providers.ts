import { DOCUMENT, inject, type Provider } from '@angular/core';
import { systemClock, type Clock } from '../../domain/shared/clock';
import type { IdGenerator } from '../../domain/shared/ids';
import {
  CLOCK,
  CREDENTIAL_REPOSITORY,
  DATABASE_SCHEMA_VERSION,
  ENRICHMENT_REPOSITORY,
  GRAMMAR_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
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

/** Binds every domain port to its Dexie-backed implementation. */
export function providePersistence(): Provider[] {
  return [
    { provide: CLOCK, useValue: systemClock },
    { provide: DATABASE_SCHEMA_VERSION, useValue: CURRENT_SCHEMA_VERSION },
    { provide: HASHER, useValue: sha256Hasher },
    { provide: ID_GENERATOR, useValue: cryptoIdGenerator },
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
