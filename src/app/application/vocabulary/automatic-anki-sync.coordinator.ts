import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { ankiError, type AnkiError } from '../../domain/anki/anki-error';
import type { ExtractedEntry } from '../../domain/anki/anki-provider';
import { canRefresh } from '../../domain/anki/capabilities';
import { canRefreshMappings, resolveMappings } from '../../domain/anki/mapping-validation';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import {
  isAutomaticAnkiSource,
  type AnkiConnectionKind,
  type AnkiVocabularySource,
  type VocabularySourceCache,
} from '../../domain/vocabulary/vocabulary-source';
import { ANKI_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { CLOCK, VOCABULARY_SOURCE_REPOSITORY } from '../shared/repository-tokens';
import type { Clock } from '../../domain/shared/clock';
import { VocabularySyncService } from './vocabulary-sync.service';

const COOLDOWN_MS = 60_000;
const START_DELAY_MS = 1_500;
const RETRY_INTERVAL_MS = 5 * 60_000;
const SUCCESS_VISIBLE_MS = 8_000;

export type AutomaticAnkiSyncStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'updated'; readonly snapshot: VocabularySnapshot }
  | { readonly kind: 'waiting'; readonly message: string }
  | { readonly kind: 'attention'; readonly message: string };

/** Opportunistically refreshes configured live Anki sources while Monosai is open. */
@Injectable()
export class AutomaticAnkiSyncCoordinator {
  private readonly repository = inject(VOCABULARY_SOURCE_REPOSITORY);
  private readonly createProvider = inject(ANKI_PROVIDER_FACTORY);
  private readonly sync = inject(VocabularySyncService);
  private readonly clock = inject<Clock>(CLOCK);
  private readonly view = inject(DOCUMENT).defaultView;

  private readonly statusSignal = signal<AutomaticAnkiSyncStatus>({ kind: 'idle' });
  private started = false;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | null = null;

  readonly status = this.statusSignal.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.view?.setTimeout(() => void this.trigger(), START_DELAY_MS);
    this.view?.setInterval(() => {
      if (this.view?.document.visibilityState === 'visible') {
        void this.trigger();
      }
    }, RETRY_INTERVAL_MS);
    this.view?.document.addEventListener('visibilitychange', () => {
      if (this.view?.document.visibilityState === 'visible') {
        void this.trigger();
      }
    });
    this.view?.addEventListener('focus', () => void this.trigger());
  }

  trigger(force = false): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    const now = this.clock.now();
    if (!force && now - this.lastAttemptAt < COOLDOWN_MS) {
      return Promise.resolve();
    }
    this.lastAttemptAt = now;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    const listed = await this.repository.list();
    if (!listed.ok) {
      this.statusSignal.set({ kind: 'attention', message: listed.error.message });
      return;
    }
    const sources = listed.value.filter(isAutomaticAnkiSource);
    if (sources.length === 0) {
      this.statusSignal.set({ kind: 'idle' });
      return;
    }

    this.statusSignal.set({ kind: 'checking' });
    const replacements: VocabularySourceCache[] = [];
    for (const providerKind of distinctProviderKinds(sources)) {
      const refreshed = await this.readProviderSources(
        providerKind,
        sources.filter((source) => source.providerKind === providerKind),
      );
      if (!refreshed.ok) {
        this.statusSignal.set({
          kind: transient(refreshed.error) ? 'waiting' : 'attention',
          message: `${refreshed.error.message} Your current vocabulary was kept.`,
        });
        return;
      }
      replacements.push(...refreshed.caches);
    }

    const previous = await this.repository.readCaches(replacements.map((cache) => cache.sourceId));
    if (!previous.ok) {
      this.statusSignal.set({ kind: 'attention', message: previous.error.message });
      return;
    }
    const previousById = new Map(previous.value.map((cache) => [cache.sourceId, cache]));
    const emptied = replacements.find(
      (cache) =>
        cache.entries.length === 0 && (previousById.get(cache.sourceId)?.entries.length ?? 0) > 0,
    );
    if (emptied !== undefined) {
      const source = sources.find((candidate) => candidate.id === emptied.sourceId);
      this.statusSignal.set({
        kind: 'attention',
        message: `${source?.label ?? 'An Anki source'} unexpectedly returned no vocabulary. Review it in Vocabulary settings; the current vocabulary was kept.`,
      });
      return;
    }

    const prepared = await this.sync.prepare(replacements);
    if (!prepared.ok) {
      this.statusSignal.set({
        kind: 'attention',
        message: `${prepared.error.message} Your current vocabulary was kept.`,
      });
      return;
    }
    const committed = await this.sync.commit(prepared.value);
    if (!committed.ok) {
      this.statusSignal.set({
        kind: 'attention',
        message: `${committed.error.message} Your current vocabulary was kept.`,
      });
      return;
    }
    if (!prepared.value.vocabularyChanged) {
      this.statusSignal.set({ kind: 'idle' });
      return;
    }
    this.statusSignal.set({ kind: 'updated', snapshot: committed.value });
    this.view?.setTimeout(() => {
      const status = this.statusSignal();
      if (
        status.kind === 'updated' &&
        status.snapshot.id === committed.value.id &&
        status.snapshot.createdAt === committed.value.createdAt
      ) {
        this.statusSignal.set({ kind: 'idle' });
      }
    }, SUCCESS_VISIBLE_MS);
  }

  private async readProviderSources(
    providerKind: AnkiConnectionKind,
    sources: readonly AnkiVocabularySource[],
  ): Promise<
    | { readonly ok: true; readonly caches: readonly VocabularySourceCache[] }
    | { readonly ok: false; readonly error: AnkiError }
  > {
    const provider = this.createProvider(providerKind);
    try {
      const probed = await provider.probe();
      if (!probed.ok) {
        return probed;
      }
      if (!canRefresh(probed.value)) {
        return {
          ok: false,
          error: ankiError(
            'review-evidence-unsupported',
            'This Anki connection cannot prove which cards were reviewed.',
          ),
        };
      }
      const catalog = await provider.discover();
      if (!catalog.ok) {
        return catalog;
      }
      const resolution = resolveMappings(sources, catalog.value);
      if (!canRefreshMappings(resolution)) {
        return {
          ok: false,
          error: ankiError(
            'query-failed',
            'An automatic Anki source no longer matches its deck, note type, or field.',
          ),
        };
      }

      const entries = new Map(sources.map((source) => [source.id, [] as ExtractedEntry[]]));
      const warnings: string[] = [];
      for await (const event of provider.extractReviewed(resolution.resolved)) {
        if (event.kind === 'entry') {
          entries.get(event.entry.sourceMappingId)?.push(event.entry);
        } else if (event.kind === 'warning') {
          warnings.push(event.message);
        } else if (event.kind === 'failed') {
          return { ok: false, error: event.error };
        }
      }
      const refreshedAt = this.clock.now();
      return {
        ok: true,
        caches: sources.map((source) => ({
          sourceId: source.id,
          refreshedAt,
          entries: (entries.get(source.id) ?? []).map((entry) => ({
            rawValue: entry.rawFieldValue,
            ...(entry.sourceNoteId === undefined ? {} : { sourceRecordId: entry.sourceNoteId }),
          })),
          warnings,
        })),
      };
    } finally {
      provider.dispose();
    }
  }
}

function distinctProviderKinds(
  sources: readonly AnkiVocabularySource[],
): readonly AnkiConnectionKind[] {
  return [
    ...new Set(
      sources
        .map((source) => source.providerKind)
        .filter((kind): kind is AnkiConnectionKind => kind !== 'package'),
    ),
  ];
}

function transient(error: AnkiError): boolean {
  return ['not-running', 'bridge-not-running', 'timeout', 'cancelled'].includes(error.code);
}
