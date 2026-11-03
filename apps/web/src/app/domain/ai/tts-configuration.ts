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
