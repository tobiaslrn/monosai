import { Injectable, inject } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import { languageError } from '../../domain/language/language-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import type {
  TextListVocabularySource,
  VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import type { SnapshotCommit } from '../../domain/vocabulary/vocabulary-repository';
import { LanguageStore } from '../language/language.store';
import { VocabularyClassificationService } from '../reading/vocabulary-classification.service';
import { AppSettingsStore } from '../settings/app-settings.store';
import { VOCABULARY_REPOSITORY, VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import { SnapshotBuilder, type AnalysisProgress } from './snapshot-builder';

export type VocabularySyncFailure = LanguageError | StorageError;

export interface PreparedVocabularySync {
  readonly commit: SnapshotCommit;
  readonly replacementCaches: readonly VocabularySourceCache[];
}

/** Builds the one active vocabulary from independent, persisted source caches. */
@Injectable({ providedIn: 'root' })
export class VocabularySyncService {
  private readonly sources = inject(VOCABULARY_SOURCE_REPOSITORY);
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly builder = inject(SnapshotBuilder);
  private readonly language = inject(LanguageStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly classification = inject(VocabularyClassificationService);

  async prepare(
    replacementCaches: readonly VocabularySourceCache[] = [],
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<PreparedVocabularySync, VocabularySyncFailure>> {
    const ready = await this.language.initialize();
    if (!ready) {
      return err(
        this.language.lastError() ??
          languageError('unknown', 'Japanese language support could not be prepared.'),
      );
    }

    const listed = await this.sources.list();
    if (!listed.ok) {
      return listed;
    }
    const enabled = listed.value.filter((source) => source.enabled);
    const cached = await this.sources.readCaches(enabled.map((source) => source.id));
    if (!cached.ok) {
      return cached;
    }
    const cachesById = new Map(cached.value.map((cache) => [cache.sourceId, cache]));
    for (const cache of replacementCaches) {
      cachesById.set(cache.sourceId, cache);
    }

    const current = await this.vocabulary.getActiveSnapshot();
    if (!current.ok) {
      return current;
    }
    const warnings = new Set<string>();
    const entries = enabled.flatMap((source) => {
      const cache = cachesById.get(source.id);
      if (cache === undefined) {
        warnings.add(`${source.label} has not been read yet.`);
        return [];
      }
      for (const warning of cache.warnings) {
        warnings.add(warning);
      }
      return cache.entries.map((entry) => ({ sourceId: source.id, ...entry }));
    });

    const built = await this.builder.build(
      {
        entries,
        sources: enabled,
        warnings: [...warnings],
        ...(current.value === null ? {} : { snapshotId: current.value.id }),
      },
      onProgress,
      signal,
    );
    return built.ok ? ok({ commit: built.value.commit, replacementCaches }) : err(built.error);
  }

  async commit(
    prepared: PreparedVocabularySync,
  ): Promise<Result<VocabularySnapshot, VocabularySyncFailure>> {
    if (prepared.replacementCaches.length > 0) {
      const cached = await this.sources.replaceCaches(prepared.replacementCaches);
      if (!cached.ok) {
        return cached;
      }
    }
    const committed = await this.vocabulary.commitSnapshot(prepared.commit);
    if (!committed.ok) {
      return committed;
    }
    await this.settings.reloadAppSettings();
    this.classification.invalidate();
    return committed;
  }

  async applyTextSource(
    source: TextListVocabularySource,
  ): Promise<Result<VocabularySnapshot, VocabularySyncFailure>> {
    const parsed = parseTextList(source.content);
    const cache: VocabularySourceCache = {
      sourceId: source.id,
      refreshedAt: source.lastSyncedAt ?? source.updatedAt,
      entries: parsed.entries.map((rawValue, index) => ({
        rawValue,
        sourceRecordId: String(index + 1),
      })),
      warnings: [],
    };
    const prepared = await this.prepare([cache]);
    return prepared.ok ? this.commit(prepared.value) : prepared;
  }

  /** Rebuilds after enable/disable/remove using the caches that remain. */
  async rebuild(): Promise<Result<VocabularySnapshot, VocabularySyncFailure>> {
    const prepared = await this.prepare();
    return prepared.ok ? this.commit(prepared.value) : prepared;
  }
}
