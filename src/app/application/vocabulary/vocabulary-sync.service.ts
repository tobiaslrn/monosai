import { Injectable, inject } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import { languageError } from '../../domain/language/language-error';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import type {
  TextListVocabularySource,
  VocabularySource,
  VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import type { SnapshotCommit } from '../../domain/vocabulary/vocabulary-repository';
import { LanguageStore } from '../language/language.store';
import { VocabularyClassificationService } from '../reading/vocabulary-classification.service';
import { AppSettingsStore } from '../settings/app-settings.store';
import { VOCABULARY_REPOSITORY, VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import { SnapshotBuilder, type AnalysisProgress } from './snapshot-builder';

export type VocabularySyncFailure = LanguageError | StorageError;

/**
 * What one prepared vocabulary is built from.
 *
 * Sources given here are not stored yet: a package import needs its mapping to
 * take part in the snapshot before the learner has committed to keeping it, and
 * nothing may be written until the whole commit succeeds.
 */
export interface PrepareInput {
  /** Caches replacing whatever is stored for those sources. */
  readonly caches?: readonly VocabularySourceCache[];
  /** Sources to add or replace, applied over the stored list in memory. */
  readonly sources?: readonly VocabularySource[];
}

export interface PreparedVocabularySync {
  readonly commit: SnapshotCommit;
  /** True when the merged canonical expression set differs from the active snapshot. */
  readonly vocabularyChanged: boolean;
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
    input: PrepareInput = {},
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<PreparedVocabularySync, VocabularySyncFailure>> {
    const replacementCaches = input.caches ?? [];
    const pendingSources = input.sources ?? [];
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
    const enabled = upsert(listed.value, pendingSources).filter((source) => source.enabled);
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
    let currentExpressionHashes: readonly string[] = [];
    if (current.value !== null) {
      const hashes = await this.vocabulary.listExpressionHashes(current.value.id);
      if (!hashes.ok) {
        return hashes;
      }
      currentExpressionHashes = hashes.value;
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
    if (!built.ok) {
      return err(built.error);
    }
    return ok({
      commit: { ...built.value.content, sources: pendingSources, caches: replacementCaches },
      vocabularyChanged: !sameExpressionHashes(
        currentExpressionHashes,
        built.value.content.items.map((item) => item.expressionHash),
      ),
    });
  }

  /**
   * Writes the prepared vocabulary and everything it was built from.
   *
   * One repository call, so one transaction: sources, caches, snapshot, items,
   * provenance, and activation either all land or none do.
   */
  async commit(
    prepared: PreparedVocabularySync,
  ): Promise<Result<VocabularySnapshot, VocabularySyncFailure>> {
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
    const prepared = await this.prepare({ caches: [cache] });
    return prepared.ok ? this.commit(prepared.value) : prepared;
  }

  /** Rebuilds after enable/disable/remove using the caches that remain. */
  async rebuild(): Promise<Result<VocabularySnapshot, VocabularySyncFailure>> {
    const prepared = await this.prepare();
    return prepared.ok ? this.commit(prepared.value) : prepared;
  }
}

/** Stored sources with the pending ones applied over them, order preserved. */
function upsert(
  stored: readonly VocabularySource[],
  pending: readonly VocabularySource[],
): readonly VocabularySource[] {
  if (pending.length === 0) {
    return stored;
  }
  const byId = new Map(pending.map((source) => [source.id, source]));
  const merged = stored.map((source) => byId.get(source.id) ?? source);
  const storedIds = new Set(stored.map((source) => source.id));
  return [...merged, ...pending.filter((source) => !storedIds.has(source.id))];
}

function sameExpressionHashes(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  for (const hash of leftSet) {
    if (!rightSet.has(hash)) {
      return false;
    }
  }
  return true;
}
