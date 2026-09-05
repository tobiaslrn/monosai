import type { Hasher } from '../shared/hashing';
import { hashCanonical } from '../shared/hashing';
import {
  resolveGuidance,
  type GrammarPreset,
  type RegisterGuidance,
  type RegisterPreference,
} from './presets';
import type { GrammarProfileSelection, GrammarProfileSnapshot } from './profile';

/** Domain prefix keeping grammar profile hashes distinct, per ADR 0002. */
const HASH_DOMAIN = 'grammar-profile';

/**
 * Everything a grammar profile hash covers, and nothing more.
 *
 * Deliberately narrow: it hashes the guidance text that is actually sent, not
 * the preset id or the bundle version that produced it. A copyedit to a preset
 * that leaves the resolved text unchanged must not stale every stored analysis,
 * and neither must a dictionary or tokenizer refresh. The structural baseline
 * version is in scope because it decides which forms count as readable, so
 * grammar findings judged against one baseline are not comparable to another.
 */
export interface GrammarProfileHashInput {
  readonly resolvedGuidance: string;
  readonly registerPreference: RegisterPreference;
  readonly structuralBaselineVersion: string;
}

export function grammarProfileHash(hasher: Hasher, input: GrammarProfileHashInput): string {
  return hashCanonical(hasher, HASH_DOMAIN, {
    resolvedGuidance: input.resolvedGuidance,
    registerPreference: input.registerPreference,
    structuralBaselineVersion: input.structuralBaselineVersion,
  });
}

/**
 * Freezes the live profile into the record a generated story is judged against.
 *
 * The resolved guidance is built with `resolveGuidance`, the same function the
 * prompt uses, so the hashed text and the sent text cannot diverge. The snapshot
 * is content addressed: its id is its hash, so two stories generated under an
 * identical profile share one capture instead of accumulating duplicates.
 */
export function captureGrammarProfile(
  hasher: Hasher,
  selection: GrammarProfileSelection,
  preset: GrammarPreset,
  registerGuidance: RegisterGuidance,
  structuralBaselineVersion: string,
  capturedAt: number,
): GrammarProfileSnapshot {
  const resolvedGuidance = resolveGuidance(
    preset.promptGuidance,
    registerGuidance[selection.registerPreference],
    selection.customGuidance,
  );
  const profileHash = grammarProfileHash(hasher, {
    resolvedGuidance,
    registerPreference: selection.registerPreference,
    structuralBaselineVersion,
  });
  return Object.freeze({
    id: profileHash,
    profileHash,
    capturedAt,
    presetId: selection.presetId,
    resolvedGuidance,
    registerPreference: selection.registerPreference,
    isCustomGuidance: selection.customGuidance !== undefined,
    structuralBaselineVersion,
  });
}
