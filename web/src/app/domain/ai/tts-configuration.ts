/** Whether an exact OpenRouter model ID identifies Google's Gemini family. */
export function isGeminiModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.startsWith('google/gemini-');
}

export function isGeminiTtsModel(modelId: string): boolean {
  return isGeminiModel(modelId) && modelId.trim().toLowerCase().includes('-tts');
}

export const GEMINI_DEFAULT_VOICE = 'Kore';

/** Gemini has a stable provider voice default; other providers do not. */
export function resolveTtsVoice(modelId: string, voiceId: string): string {
  const exactVoice = voiceId.trim();
  return exactVoice === '' && isGeminiTtsModel(modelId) ? GEMINI_DEFAULT_VOICE : exactVoice;
}

/**
 * Voice IDs the providers use to mark a Japanese voice.
 *
 * Catalogs name voices freely, but the ones that are tied to a language say so
 * in a few recurring ways: a `ja`/`jp` segment (`aura-2-ama-ja`), a locale
 * (`ja-JP-…`), a Kokoro-style `jf_`/`jm_` prefix, or the language spelled out.
 */
const JAPANESE_VOICE_PATTERNS: readonly RegExp[] = [
  /^j[fm]_/iu,
  /(?:^|[-_.:])(?:ja|jp)(?:[-_.:]|$)/iu,
  /japan/iu,
];

/**
 * The voice to start a speech model on: a Japanese one if the catalog marks
 * any, else the catalog's first, else none.
 *
 * Many speech models choose the language from the voice, so the first voice of
 * an English-first catalog reads Japanese with an English phonology.
 */
export function preferredSpeechVoice(voices: readonly string[]): string {
  return (
    voices.find((voice) => JAPANESE_VOICE_PATTERNS.some((pattern) => pattern.test(voice))) ??
    voices[0] ??
    ''
  );
}
