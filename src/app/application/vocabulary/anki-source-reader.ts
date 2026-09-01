import { Injectable, inject } from '@angular/core';
import { ankiError, type AnkiError } from '../../domain/anki/anki-error';
import type { ExtractedEntry } from '../../domain/anki/anki-provider';
import { canRefresh } from '../../domain/anki/capabilities';
import { canRefreshMappings, resolveMappings } from '../../domain/anki/mapping-validation';
import type { Clock } from '../../domain/shared/clock';
import { err, ok, type Result } from '../../domain/shared/result';
import type {
  AnkiConnectionKind,
  AnkiVocabularySource,
  VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import { ANKI_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { CLOCK } from '../shared/repository-tokens';

/**
 * Reads live Anki sources into caches, without writing anything.
 *
 * Both the background coordinator and the manual Sync now action need exactly
 * this: connect, prove the connection can show what was reviewed, check the
 * mappings still resolve, and stream the entries out. Keeping it in one place
 * is what stops the two paths from disagreeing about when a read counts as
 * complete — a partial read must never reach a cache, because a cache replaces
 * what a source contributes wholesale.
 */
@Injectable({ providedIn: 'root' })
export class AnkiSourceReader {
  private readonly createProvider = inject(ANKI_PROVIDER_FACTORY);
  private readonly clock = inject<Clock>(CLOCK);

  /**
   * Reads every given source of one connection kind.
   *
   * The sources must all share `providerKind`; one connection is opened, used,
   * and disposed. A failure returns the reason and no caches at all, so a
   * caller can never commit half a read.
   */
  async read(
    providerKind: AnkiConnectionKind,
    sources: readonly AnkiVocabularySource[],
    signal?: AbortSignal,
  ): Promise<Result<readonly VocabularySourceCache[], AnkiError>> {
    const provider = this.createProvider(providerKind);
    try {
      const probed = await provider.probe(signal);
      if (!probed.ok) {
        return probed;
      }
      if (!canRefresh(probed.value)) {
        return err(
          ankiError(
            'review-evidence-unsupported',
            'This Anki connection cannot prove which cards were reviewed.',
          ),
        );
      }
      const catalog = await provider.discover(signal);
      if (!catalog.ok) {
        return catalog;
      }
      const resolution = resolveMappings(sources, catalog.value);
      if (!canRefreshMappings(resolution)) {
        return err(
          ankiError(
            'query-failed',
            'An Anki source no longer matches its deck, note type, or field.',
          ),
        );
      }

      const entries = new Map(sources.map((source) => [source.id, [] as ExtractedEntry[]]));
      const warnings: string[] = [];
      for await (const event of provider.extractReviewed(resolution.resolved, signal)) {
        if (event.kind === 'entry') {
          entries.get(event.entry.sourceMappingId)?.push(event.entry);
        } else if (event.kind === 'warning') {
          warnings.push(event.message);
        } else if (event.kind === 'failed') {
          return err(event.error);
        }
      }
      if (signal?.aborted === true) {
        return err(ankiError('cancelled', 'The read was cancelled before it finished.'));
      }

      const refreshedAt = this.clock.now();
      return ok(
        sources.map((source) => ({
          sourceId: source.id,
          refreshedAt,
          entries: (entries.get(source.id) ?? []).map((entry) => ({
            rawValue: entry.rawFieldValue,
            ...(entry.sourceNoteId === undefined ? {} : { sourceRecordId: entry.sourceNoteId }),
            ...(entry.reps === undefined ? {} : { reps: entry.reps }),
            ...(entry.lapseRatio === undefined ? {} : { lapseRatio: entry.lapseRatio }),
            ...(entry.easeFactor === undefined ? {} : { easeFactor: entry.easeFactor }),
          })),
          warnings,
        })),
      );
    } finally {
      provider.dispose();
    }
  }
}

/** True when a failure is worth waiting out rather than acting on. */
export function isTransientAnkiFailure(error: AnkiError): boolean {
  return ['not-running', 'bridge-not-running', 'timeout', 'cancelled'].includes(error.code);
}
