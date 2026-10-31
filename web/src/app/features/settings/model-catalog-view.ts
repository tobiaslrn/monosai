import { Injectable, computed, inject, linkedSignal, resource } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { MODEL_CATALOG } from '../../application/shared/ai-tokens';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';

interface LoadedCatalog {
  readonly text: readonly ModelCapabilities[];
  readonly speech: readonly ModelCapabilities[];
}

/**
 * The model catalogue the AI settings are drawn from.
 *
 * Provided by the models section, so every panel in it shares one fetch that
 * lasts as long as the section does.
 */
@Injectable()
export class ModelCatalogView {
  private readonly catalog = inject(MODEL_CATALOG);
  private readonly credential = inject(CredentialStore);

  /**
   * The catalogue, fetched as soon as a key can pay for it.
   *
   * The saved configuration cannot be shown correctly until the catalogue is
   * known: a stored speech model has no listed voices, and a stored text model
   * no reasoning efforts, until its entry is in hand. Waiting for a picker to be
   * opened left those fields showing a fallback the learner never chose. The
   * key being configured is the whole of the request, so a second key replaces
   * the first through `reload` and a failure waits for a picker to retry it.
   */
  private readonly load = resource({
    params: () => (this.credential.isConfigured() ? true : undefined),
    loader: async () => {
      const [text, speech] = await Promise.all([
        this.catalog.list('text'),
        this.catalog.list('speech'),
      ]);
      if (!text.ok || !speech.ok) {
        throw new Error(
          (!text.ok ? text.error : !speech.ok ? speech.error : null)?.message ??
            'Could not load models.',
        );
      }
      return { text: text.value, speech: speech.value };
    },
  });
  /**
   * The last catalogue that arrived. Removing the key or a failed refetch keeps
   * what is already known, so the names on the saved choices do not vanish.
   */
  private readonly loaded = linkedSignal<LoadedCatalog | undefined, LoadedCatalog>({
    source: () => (this.load.hasValue() ? this.load.value() : undefined),
    computation: (arrived, previous) => arrived ?? previous?.value ?? { text: [], speech: [] },
  });

  readonly textModels = computed(() => this.loaded().text);
  readonly speechModels = computed(() => this.loaded().speech);
  readonly loading = computed(() => this.load.isLoading());
  readonly failure = computed(() => this.load.error()?.message ?? null);

  reload(): void {
    this.load.reload();
  }

  /** A picker opening is the learner's retry after a failed fetch. */
  retry(): void {
    if (this.load.status() === 'error') {
      this.load.reload();
    }
  }
}
