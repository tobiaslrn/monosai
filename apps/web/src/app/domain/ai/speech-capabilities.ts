import { isGeminiTtsModel } from './tts-configuration';

/** How the model accepts the named speaking-style choice. */
export type StyleControl = 'prompted' | 'none';

/** Which optional speech channels a model is believed to accept. */
export interface SpeechCapabilities {
  readonly instructions: boolean;
  readonly styleControl: StyleControl;
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

  // Gemini takes its direction through the prompt, not a parameter, so no
  // catalog entry can ever declare it.
  const instructions = unknown || declared.includes('instructions') || isGeminiTtsModel(modelId);

  return { instructions, styleControl: instructions ? 'prompted' : 'none' };
}
