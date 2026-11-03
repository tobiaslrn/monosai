import type { GrammarPreset } from '../../domain/grammar/presets';

/**
 * The JLPT level a preset's caption says its patterns are usually taught at.
 *
 * Read from the caption rather than stored beside it, so there is still one
 * place that says where a preset sits, and a caption that names no level —
 * the starter preset's — yields none rather than an invented one.
 */
export function conventionalLevel(preset: GrammarPreset): string | null {
  return /\bN[1-5]\b/.exec(preset.captionEn)?.[0] ?? null;
}
