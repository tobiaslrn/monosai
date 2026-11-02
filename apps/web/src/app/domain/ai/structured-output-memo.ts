import type { StructuredOutputMode } from './model-test';

/**
 * What is already known about how a model has to be driven.
 *
 * A provider that refuses `response_format` refuses it for every request, not
 * for one batch. Without somewhere to record that, a run rediscovers the
 * refusal per request and pays for a second full-price request each time — on
 * every batch, for as long as the model stays configured.
 *
 * Deliberately a port rather than a map inside the adapter: the downgrade has
 * to outlive a reload, which means reaching the stored text-model settings, and
 * the request boundary must not know where settings live.
 */
export interface StructuredOutputMemo {
  /**
   * The mode this model is known to require, or null when nothing is known.
   *
   * Only refusals are ever remembered. A model that has answered a native
   * schema once is not thereby promised to answer the next one, so a positive
   * verdict here would be a claim the memo cannot support.
   */
  modeFor(modelId: string): StructuredOutputMode | null;

  /** Records that the provider refused a native schema for this model. */
  rememberDowngrade(modelId: string): void;
}
