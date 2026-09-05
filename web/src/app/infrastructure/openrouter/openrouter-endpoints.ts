/**
 * The only origin Monosai will send an OpenRouter key to.
 *
 * Arbitrary base URLs are deliberately not configurable in v1: an
 * authorization header is only ever attached after the target has been checked
 * against this constant, so a mistyped or injected URL cannot become a way to
 * ship the key somewhere else.
 */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Model metadata used by the settings picker. */
export const MODELS_PATH = '/models';

/** Text tasks use the OpenAI-compatible chat completion shape. */
export const CHAT_COMPLETIONS_PATH = '/chat/completions';

/** Speech synthesis uses the OpenAI-compatible speech shape. See ADR 0018. */
export const AUDIO_SPEECH_PATH = '/audio/speech';

/** Largest JSON body accepted, so a broken endpoint cannot exhaust memory. */
export const MAX_JSON_RESPONSE_BYTES = 1024 * 1024;

/** Largest audio body accepted. One test sentence is orders of magnitude smaller. */
export const MAX_AUDIO_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Default deadline for a single attempt. Model tests are short by design. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Synthesis is slower than a minimal completion, so it gets its own deadline. */
export const AUDIO_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Deadline for a story, a repair, or an exception review.
 *
 * Writing twenty sentences under a vocabulary constraint takes far longer than
 * a compatibility probe, and a deadline shorter than the work is a timeout the
 * learner pays for and learns nothing from.
 */
export const GENERATION_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Deadline for a grammar review or a translation batch.
 *
 * Shorter than story generation — reviewing or translating sentences that
 * already exist is less work than writing them — but longer than the default,
 * because a batch of several sentences still takes more than a single probe.
 */
export const ENRICHMENT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Whether an assembled URL still resolves inside the configured API base.
 *
 * The comparison is made on the parsed URL rather than the raw string, because
 * a traversal segment can leave a string that starts with the base but resolves
 * somewhere else entirely — and that address would otherwise receive the key.
 */
export function isOpenRouterUrl(url: string, baseUrl: string = OPENROUTER_BASE_URL): boolean {
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  if (target.origin !== base.origin) {
    return false;
  }
  const basePath = base.pathname.replace(/\/$/, '');
  return target.pathname === basePath || target.pathname.startsWith(`${basePath}/`);
}
