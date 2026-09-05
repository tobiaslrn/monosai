import { isGeminiTtsModel, supportsTtsSpeed } from './tts-configuration';

/**
 * Where a clip's speaking pace comes from.
 *
 * `native` is the numeric `speed` parameter, `prompted` is the delivery
 * instruction naming the speed, and `fixed` means the model offers neither and
 * the learner's speed setting cannot reach it. Monosai never slows a clip
 * locally, so this is the whole list of ways pace can be changed.
 */
export type PaceControl = 'native' | 'prompted' | 'fixed';

/** Which optional speech channels a model is believed to accept. */
export interface SpeechCapabilities {
  readonly speed: boolean;
  readonly instructions: boolean;
  readonly pace: PaceControl;
}

/**
 * What the provider catalog says one speech model can be asked for.
 *
 * The catalog leads and the configuration test confirms: a declaration decides
 * what is attempted, and the provider's own refusal corrects a wrong one. That
 * is why an empty parameter list means "not known yet" rather than "nothing" —
 * the catalog is fetched lazily and may not be in hand when a preview runs, and
 * an absent list must never be read as a model that can do neither.
 */
export function declaredSpeechCapabilities(
  modelId: string,
  supportedParameters: readonly string[],
): SpeechCapabilities {
  const declared = supportedParameters.map((parameter) => parameter.trim().toLowerCase());
  const unknown = declared.length === 0;

  // OpenRouter lists `speed` for every model it proxies, but documents that a
  // provider without the option ignores it. Gemini is such a provider, so the
  // override outranks the declaration rather than trusting it.
  const speed = (unknown || declared.includes('speed')) && supportsTtsSpeed(modelId);
  // Gemini takes its direction through the prompt, not a parameter, so no
  // catalog entry can ever declare it.
  const instructions = unknown || declared.includes('instructions') || isGeminiTtsModel(modelId);

  return { speed, instructions, pace: speed ? 'native' : instructions ? 'prompted' : 'fixed' };
}
