import { DestroyRef, Injectable, inject } from '@angular/core';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { ClassificationResult, SentenceTokens } from '../../domain/language/language-runtime';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { SnapshotId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { LanguageStore } from '../language/language.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

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
 * recompiled only when the vocabulary changes.
 *
 * A refresh keeps the vocabulary's id and only moves its revision, and a
 * refresh in another tab tells this one nothing. So the matcher is identified
 * by id and revision, and every classification first reads the stored
 * revision: a single small read, which is what lets a tab notice a vocabulary
 * another tab committed.
 */
@Injectable({ providedIn: 'root' })
export class VocabularyClassificationService {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly settings = inject(AppSettingsStore);
  private readonly language = inject(LanguageStore);

  private compiled: CompiledMatcher | null = null;
  /** Moves on every `invalidate`, so a compile that was already running cannot claim to be current. */
  private generation = 0;

  constructor() {
    // A runtime that lost its state (its worker crashed) lost the matcher too.
    inject(DestroyRef).onDestroy(
      this.runtime.onStateLost(() => {
        this.invalidate();
      }),
    );
  }

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
    this.compiled = null;
    this.generation += 1;
  }

  private async ensureCompiled(
    snapshotId: SnapshotId,
    signal?: AbortSignal,
  ): Promise<Result<void, LanguageError>> {
    const stored = await this.vocabulary.getSnapshot(snapshotId);
    if (!stored.ok) {
      return err(unreadable(stored.error));
    }
    const storedRevision = stored.value?.revision ?? null;
    if (this.compiled?.snapshotId === snapshotId && this.compiled.revision === storedRevision) {
      return ok(undefined);
    }

    const generation = this.generation;
    const loaded = await this.vocabulary.loadItems(snapshotId);
    if (!loaded.ok) {
      return err(unreadable(loaded.error));
    }

    const compiled = await this.runtime.compileSnapshot(
      snapshotId,
      loaded.value?.items ?? [],
      signal,
    );
    if (!compiled.ok) {
      return compiled;
    }
    // The revision the items were read at, not the one checked above: a commit
    // between the two reads is then caught by the next classification.
    if (generation === this.generation) {
      this.compiled = { snapshotId, revision: loaded.value?.revision ?? null };
    }
    return ok(undefined);
  }
}

/** Which vocabulary the worker's matcher was built from. */
interface CompiledMatcher {
  readonly snapshotId: SnapshotId;
  /** Null when the vocabulary was no longer stored and the matcher is empty. */
  readonly revision: string | null;
}

function unreadable(error: StorageError): LanguageError {
  return languageError('snapshot-not-compiled', 'Your vocabulary could not be read.', error.code);
}
