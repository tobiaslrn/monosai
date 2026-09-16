import type { ModelCapabilities } from './model-catalog';

/**
 * The parameters OpenRouter advertises for a model that can be asked to return
 * a shape rather than prose. Either one is enough: `structured_outputs` is the
 * schema-constrained mode, `response_format` the JSON-object mode, and ADR 0020
 * records that Monosai opens generation in whichever the model's test proved.
 */
const STRUCTURED_OUTPUT_PARAMETERS = ['structured_outputs', 'response_format'];

/**
 * A short, deliberately curated list of text models that have answered
 * Monosai's structured-output test.
 *
 * It exists because the first model choice is the sharpest edge in setup: the
 * picker offers the whole OpenRouter catalogue, many of its models fail the
 * structured-output test while answering ordinary chat perfectly well, and a
 * first-time learner has no basis at all for the decision.
 *
 * It is a starting point, not a whitelist — nothing is hidden or blocked by
 * being absent. Every entry is checked against the live catalogue before it is
 * shown, so an identifier OpenRouter has retired stops being suggested rather
 * than leading somewhere that no longer exists.
 */
export const SUGGESTED_TEXT_MODEL_IDS: readonly string[] = [
  'google/gemini-2.5-flash',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
  'deepseek/deepseek-chat',
];

/** Whether the catalogue says this model can be asked for structured output. */
export function declaresStructuredOutput(model: ModelCapabilities): boolean {
  return model.supportedParameters.some((parameter) =>
    STRUCTURED_OUTPUT_PARAMETERS.includes(parameter),
  );
}

/**
 * The suggested models the catalogue actually lists, in the curated order.
 *
 * A suggestion that the catalogue no longer says can return structured output
 * is dropped too: the list is a claim about what works, and the catalogue is
 * the only current evidence available without spending a request.
 */
export function suggestedTextModels(
  models: readonly ModelCapabilities[],
  suggestedIds: readonly string[] = SUGGESTED_TEXT_MODEL_IDS,
): readonly ModelCapabilities[] {
  return suggestedIds.flatMap((id) => {
    const model = models.find((candidate) => candidate.modelId === id);
    return model !== undefined && declaresStructuredOutput(model) ? [model] : [];
  });
}
