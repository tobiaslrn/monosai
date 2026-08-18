import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
} from '../../domain/grammar/profile';
import {
  MAXIMUM_GUIDANCE_LENGTH,
  resolveGuidance,
  type GrammarPreset,
  type GrammarPresetId,
  type RegisterPreference,
} from '../../domain/grammar/presets';
import type { StorageError } from '../../domain/storage/storage-error';
import { LanguageStore } from '../language/language.store';
import { GRAMMAR_REPOSITORY } from '../shared/repository-tokens';

/**
 * Owns the live grammar profile.
 *
 * A preset is always set, so unlike the per-rule selection this replaced the
 * profile is never empty and generation is never gated on it. Writes are saved
 * immediately; a failed write surfaces a typed error and leaves the stored
 * profile untouched.
 */
@Injectable({ providedIn: 'root' })
export class GrammarProfileStore {
  private readonly repository = inject(GRAMMAR_REPOSITORY);
  private readonly language = inject(LanguageStore);

  private readonly selectionSignal = signal<GrammarProfileSelection>(
    DEFAULT_GRAMMAR_PROFILE_SELECTION,
  );
  private readonly loadedSignal = signal(false);
  private readonly errorSignal = signal<StorageError | null>(null);

  readonly selection = this.selectionSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  readonly presets = this.language.grammarPresets;

  readonly selectedPreset = computed<GrammarPreset | null>(() => {
    const id = this.selectionSignal().presetId;
    return this.presets().find((preset) => preset.id === id) ?? null;
  });

  readonly isCustomGuidance = computed(() => this.selectionSignal().customGuidance !== undefined);

  /** Exactly what would be sent to the model for the current profile. */
  readonly resolvedGuidance = computed(() => {
    const preset = this.selectedPreset();
    if (!preset) {
      return '';
    }
    const register = this.language.registerGuidance();
    return resolveGuidance(
      preset.promptGuidance,
      register?.[this.selectionSignal().registerPreference] ?? '',
      this.selectionSignal().customGuidance,
    );
  });

  async load(): Promise<void> {
    const loaded = await this.repository.getSelection();
    if (!loaded.ok) {
      this.errorSignal.set(loaded.error);
      return;
    }
    this.selectionSignal.set(loaded.value);
    this.loadedSignal.set(true);
    this.errorSignal.set(null);
  }

  selectPreset(presetId: GrammarPresetId): Promise<void> {
    // Forking is tied to the preset it was copied from, so moving stops is a
    // deliberate reset rather than silently re-parenting edited prose.
    return this.write({ ...this.selectionSignal(), presetId, customGuidance: undefined });
  }

  selectRegister(registerPreference: RegisterPreference): Promise<void> {
    return this.write({ ...this.selectionSignal(), registerPreference });
  }

  setCustomGuidance(guidance: string): Promise<void> {
    const trimmed = guidance.trim().slice(0, MAXIMUM_GUIDANCE_LENGTH);
    return this.write({
      ...this.selectionSignal(),
      customGuidance: trimmed.length === 0 ? undefined : trimmed,
    });
  }

  resetToPreset(): Promise<void> {
    return this.write({ ...this.selectionSignal(), customGuidance: undefined });
  }

  private async write(next: GrammarProfileSelection): Promise<void> {
    const saved = await this.repository.setSelection(next);
    if (!saved.ok) {
      this.errorSignal.set(saved.error);
      return;
    }
    this.selectionSignal.set(next);
    this.errorSignal.set(null);
  }
}
