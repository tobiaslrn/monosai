import { InjectionToken } from '@angular/core';
import type { Clock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import type { IdGenerator } from '../../domain/shared/ids';
import type { RandomSource } from '../../domain/shared/random';
import type { ReadingRepository } from '../../domain/reading/reading-repository';
import type { SettingsRepository } from '../../domain/settings/settings-repository';
import type { CredentialRepository } from '../../domain/settings/credential-repository';
import type { VocabularyRepository } from '../../domain/vocabulary/vocabulary-repository';
import type { VocabularySourceRepository } from '../../domain/vocabulary/vocabulary-source-repository';
import type { GrammarRepository } from '../../domain/grammar/grammar-repository';
import type { EnrichmentRepository } from '../../domain/enrichment/enrichment-repository';
import type { JobRepository } from '../../domain/enrichment/job-repository';
import type { StorageMaintenance } from '../../domain/storage/storage-maintenance';
import type { ReadingMutationChannel } from '../reading/reading-mutation-channel';

/**
 * Injection tokens for domain ports.
 *
 * Application services and features depend on these tokens, never on the Dexie
 * adapters that satisfy them.
 */
export const READING_REPOSITORY = new InjectionToken<ReadingRepository>(
  'monosai.reading-repository',
);
export const SETTINGS_REPOSITORY = new InjectionToken<SettingsRepository>(
  'monosai.settings-repository',
);
export const CREDENTIAL_REPOSITORY = new InjectionToken<CredentialRepository>(
  'monosai.credential-repository',
);
export const VOCABULARY_REPOSITORY = new InjectionToken<VocabularyRepository>(
  'monosai.vocabulary-repository',
);
export const VOCABULARY_SOURCE_REPOSITORY = new InjectionToken<VocabularySourceRepository>(
  'monosai.vocabulary-source-repository',
);
/** Compatibility alias while Anki mapping components are being generalized. */
export const SOURCE_MAPPING_REPOSITORY = VOCABULARY_SOURCE_REPOSITORY;
export const GRAMMAR_REPOSITORY = new InjectionToken<GrammarRepository>(
  'monosai.grammar-repository',
);
export const ENRICHMENT_REPOSITORY = new InjectionToken<EnrichmentRepository>(
  'monosai.enrichment-repository',
);
export const JOB_REPOSITORY = new InjectionToken<JobRepository>('monosai.job-repository');
export const STORAGE_MAINTENANCE = new InjectionToken<StorageMaintenance>(
  'monosai.storage-maintenance',
);
/** Cross-tab notification of reading mutations. See ADR 0042. */
export const READING_MUTATION_CHANNEL = new InjectionToken<ReadingMutationChannel>(
  'monosai.reading-mutation-channel',
);

/** Active persistence schema version, surfaced in Settings diagnostics. */
export const DATABASE_SCHEMA_VERSION = new InjectionToken<number>(
  'monosai.database-schema-version',
);

export const CLOCK = new InjectionToken<Clock>('monosai.clock');
export const HASHER = new InjectionToken<Hasher>('monosai.hasher');
export const ID_GENERATOR = new InjectionToken<IdGenerator>('monosai.id-generator');
export const RANDOM_SOURCE = new InjectionToken<RandomSource>('monosai.random-source');
