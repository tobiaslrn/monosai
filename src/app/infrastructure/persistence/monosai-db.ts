import Dexie, { type PromiseExtended, type Table } from 'dexie';
import type { Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { applySchema } from './migrations';
import type {
  CredentialRow,
  ParagraphRow,
  ReadingRow,
  SentenceRow,
  SettingsRow,
  TokenAnalysisRow,
} from './rows';
import type {
  AudioAssetStoredRow,
  GrammarAnalysisRow,
  TranslationRow,
} from './schemas/enrichment.schema';
import type { AssetJobRow } from './schemas/job.schema';
import type { GrammarProfileRow, GrammarProfileSnapshotRow } from './schemas/grammar.schema';
import type {
  SourceMappingRow,
  VocabularySourceCacheRow,
  VocabularyItemRow,
  VocabularyProvenanceRow,
  VocabularySnapshotRow,
} from './schemas/vocabulary.schema';
import type { FrozenValidationRow, GenerationProvenanceRow } from './schemas/generation.schema';

export const DATABASE_NAME = 'monosai';

/** Dexie database. Only repository adapters may touch these tables. */
export class MonosaiDatabase extends Dexie {
  readonly settings!: Table<SettingsRow, string>;
  readonly credentials!: Table<CredentialRow, string>;
  readonly vocabularySources!: Table<SourceMappingRow, string>;
  readonly vocabularySourceCaches!: Table<VocabularySourceCacheRow, string>;
  readonly vocabularySnapshots!: Table<VocabularySnapshotRow, string>;
  readonly vocabularyItems!: Table<VocabularyItemRow, string>;
  readonly vocabularyProvenance!: Table<VocabularyProvenanceRow, number>;
  readonly grammarProfile!: Table<GrammarProfileRow, string>;
  readonly grammarProfileSnapshots!: Table<GrammarProfileSnapshotRow, string>;
  readonly readings!: Table<ReadingRow, string>;
  readonly paragraphs!: Table<ParagraphRow, string>;
  readonly sentences!: Table<SentenceRow, string>;
  readonly tokenAnalyses!: Table<TokenAnalysisRow, [string, string]>;
  readonly frozenValidations!: Table<FrozenValidationRow, string>;
  readonly translations!: Table<TranslationRow, string>;
  readonly grammarAnalyses!: Table<GrammarAnalysisRow, string>;
  readonly audioAssets!: Table<AudioAssetStoredRow, string>;
  readonly assetJobs!: Table<AssetJobRow, string>;
  readonly generationProvenance!: Table<GenerationProvenanceRow, string>;

  constructor(
    name: string = DATABASE_NAME,
    private readonly logger?: Logger,
  ) {
    super(name);
    applySchema(this);
  }

  override open(): PromiseExtended<Dexie> {
    this.logger?.debug('storage.operation.started', { operation: 'database.open' });
    return super.open().then(
      () => {
        this.logger?.info('storage.operation.succeeded', {
          operation: 'database.open',
          schemaVersion: this.verno,
        });
        return this;
      },
      (thrown: unknown) => {
        this.logger?.error('storage.operation.failed', {
          operation: 'database.open',
          errorCode: 'open-failed',
          errorType: safeErrorTypeOf(thrown),
        });
        throw thrown;
      },
    );
  }
}
