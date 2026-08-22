import { Injectable, inject } from '@angular/core';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { ClassificationResult, SentenceTokens } from '../../domain/language/language-runtime';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { SnapshotId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import { LanguageStore } from '../language/language.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

/** Vocabulary items sent to the worker per batch while compiling a matcher. */
const ITEM_BATCH_SIZE = 500;

/**
 * Vocabulary status for a set of sentences.
 *
 * `not-configured` is a first-class answer, not an empty classification: with no
 * reviewed vocabulary, every content word would otherwise be marked as unknown,
 * which misrepresents a learner who simply has not connected Anki.
 */
export type VocabularyStatus =
  | { readonly kind: 'not-configured' }
  | {
      readonly kind: 'classified';
      readonly snapshotId: SnapshotId;
      readonly statusesBySentence: ReadonlyMap<string, readonly TokenStatusAssignment[]>;
    };

export const VOCABULARY_NOT_CONFIGURED: VocabularyStatus = { kind: 'not-configured' };

/**
 * Classifies reader tokens against the current vocabulary snapshot.
 *
 * Imported readings follow the current snapshot, so classification is derived
 * on open rather than frozen. The compiled matcher is kept in the worker and
 * recompiled only when the current snapshot changes.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyClassificationService {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly settings = inject(AppSettingsStore);
  private readonly language = inject(LanguageStore);

  private compiledSnapshotId: SnapshotId | null = null;

  async classify(
    sentences: readonly SentenceTokens[],
    signal?: AbortSignal,
  ): Promise<Result<VocabularyStatus, LanguageError>> {
    const snapshotId = this.settings.activeSnapshotId();
    if (snapshotId === null || sentences.length === 0) {
      return ok(VOCABULARY_NOT_CONFIGURED);
    }

    // On a cold start the reader can reach this before the worker has loaded
    // its assets, and compiling a matcher into an uninitialized worker fails.
    // Waiting here is what stops a snapshot the learner does have from being
    // reported as no vocabulary at all.
    const ready = await this.language.initialize();
    if (!ready) {
      return err(languageError('not-initialized', 'Japanese language support is not ready yet.'));
    }

    const compiled = await this.ensureCompiled(snapshotId, signal);
    if (!compiled.ok) {
      return compiled;
    }

    const classified = await this.runtime.classify(snapshotId, 'imported', sentences, signal);
    if (!classified.ok) {
      return classified;
    }

    const statusesBySentence = new Map<string, readonly TokenStatusAssignment[]>();
    for (const sentence of classified.value.sentences) {
      statusesBySentence.set(sentence.sentenceId, sentence.statuses);
    }
    return ok({ kind: 'classified', snapshotId, statusesBySentence });
  }

  /**
   * Classifies a generated candidate against the snapshot it was written for.
   *
   * Generated stories use the `generated` mode, where a word outside the
   * snapshot is `unknown` rather than `not-in-snapshot`: an accepted story may
   * never contain a word the learner has not reviewed, so there is no
   * "follows the current vocabulary" state for it to be in. The snapshot id is
   * passed rather than read from settings, because a generation captures its
   * snapshot before the first request and a refresh mid-run must not change
   * what the story is judged against.
   */
  async classifyGenerated(
    snapshotId: SnapshotId,
    sentences: readonly SentenceTokens[],
    signal?: AbortSignal,
  ): Promise<Result<ClassificationResult, LanguageError>> {
    const ready = await this.language.initialize();
    if (!ready) {
      return err(languageError('not-initialized', 'Japanese language support is not ready yet.'));
    }

    const compiled = await this.ensureCompiled(snapshotId, signal);
    if (!compiled.ok) {
      return compiled;
    }
    return this.runtime.classify(snapshotId, 'generated', sentences, signal);
  }

  /** Forces the next classification to rebuild the worker's matcher. */
  invalidate(): void {
    this.compiledSnapshotId = null;
  }

  private async ensureCompiled(
    snapshotId: SnapshotId,
    signal?: AbortSignal,
  ): Promise<Result<void, LanguageError>> {
    if (this.compiledSnapshotId === snapshotId) {
      return ok(undefined);
    }

    const items = [];
    for await (const batch of this.vocabulary.streamItems(snapshotId, ITEM_BATCH_SIZE)) {
      items.push(...batch);
    }

    const compiled = await this.runtime.compileSnapshot(snapshotId, items, signal);
    if (!compiled.ok) {
      return compiled;
    }
    this.compiledSnapshotId = snapshotId;
    return ok(undefined);
  }
}
