import { Injectable, inject } from '@angular/core';
import { vocabularySourceId } from '../../domain/shared/ids';
import { languageError } from '../../domain/language/language-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { parseTextList } from '../../domain/vocabulary/text-list-parser';
import type {
  TextListVocabularySource,
  VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import { CLOCK, ID_GENERATOR, VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import { SnapshotHistoryStore } from './snapshot-history.store';
import { SourceMappingStore } from './source-mapping.store';
import { VocabularySyncService, type VocabularySyncFailure } from './vocabulary-sync.service';

/** Explicit local reader write. Anki is never contacted or modified. */
@Injectable({ providedIn: 'root' })
export class ReaderWordListService {
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);
  private readonly sources = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly sync = inject(VocabularySyncService);
  private readonly ids = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);
  private pending: Promise<unknown> = Promise.resolve();

  /** Serialize additions so two open readers cannot overwrite each other's word. */
  add(expression: string): Promise<Result<string, VocabularySyncFailure>> {
    const work = this.pending.then(() => this.append(expression));
    this.pending = work.catch(() => undefined);
    return work;
  }

  private async append(expression: string): Promise<Result<string, VocabularySyncFailure>> {
    const word = expression.trim();
    if (word.length === 0 || /[\r\n]/.test(word))
      return err(languageError('invalid-request', 'Choose a single word to add.'));
    const listed = await this.repository.list();
    if (!listed.ok) return listed;
    const existing = listed.value.find(
      (source): source is TextListVocabularySource => source.kind === 'text-list' && source.enabled,
    );
    const now = this.clock.now();
    const previousContent = existing?.content ?? '';
    const content = parseTextList(previousContent).entries.includes(word)
      ? previousContent
      : previousContent +
        (previousContent.endsWith('\n') || previousContent === '' ? '' : '\n') +
        word;
    const source: TextListVocabularySource = {
      id: existing?.id ?? vocabularySourceId(this.ids.nextId()),
      kind: 'text-list',
      label: existing?.label ?? 'Reader words',
      content,
      enabled: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    const cache: VocabularySourceCache = {
      sourceId: source.id,
      refreshedAt: now,
      entries: parseTextList(content).entries.map((rawValue, index) => ({
        rawValue,
        sourceRecordId: String(index + 1),
      })),
      warnings: [],
    };
    const prepared = await this.sync.prepare({ sources: [source], caches: [cache] });
    if (!prepared.ok) return prepared;
    const committed = await this.sync.commit(prepared.value);
    if (!committed.ok) return committed;
    await Promise.all([this.sources.load(), this.history.load()]);
    return ok(source.label);
  }
}
