import { Injectable, inject } from '@angular/core';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import type { StructuredOutputMemo } from '../../domain/ai/structured-output-memo';
import { TextModelStore } from './text-model.store';

/**
 * Remembers, for the session and for the next one, which models refused a
 * native JSON schema.
 *
 * Without this the request boundary rediscovers a refusal on every batch and
 * pays for a second full-price request each time. A refusal is a fact about the
 * model and the provider, not about one request, so it is recorded once and
 * read before the first attempt.
 *
 * Only downgrades are remembered. A native schema that worked once is not a
 * promise about the next request, so nothing here can upgrade a model — that
 * verdict belongs to the model test, which actually asked.
 *
 * The in-memory map answers immediately; persisting through `TextModelStore` is
 * what makes the downgrade survive a reload, and is deliberately fire-and-
 * forget: a failed write costs one extra request after the next reload, and
 * blocking a translation batch on a settings write would cost more.
 */
@Injectable({ providedIn: 'root' })
export class StructuredOutputMemoService implements StructuredOutputMemo {
  private readonly textModel = inject(TextModelStore);
  private readonly downgraded = new Set<string>();

  modeFor(modelId: string): StructuredOutputMode | null {
    if (this.downgraded.has(modelId)) {
      return 'json-contract';
    }
    return this.textModel.requiresJsonContract(modelId) ? 'json-contract' : null;
  }

  rememberDowngrade(modelId: string): void {
    if (this.downgraded.has(modelId)) {
      return;
    }
    this.downgraded.add(modelId);
    void this.textModel.recordStructuredOutputDowngrade(modelId);
  }
}
