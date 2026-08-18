import { Injectable, computed, inject, signal } from '@angular/core';
import { captureGrammarProfile } from '../../domain/grammar/profile-hash';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../../domain/grammar/profile';
import {
  MAXIMUM_GUIDANCE_LENGTH,
  resolveGuidance,
  type GrammarPreset,
  type GrammarPresetId,
  type RegisterPreference,
} from '../../domain/grammar/presets';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { LanguageStore } from '../language/language.store';
import { CLOCK, GRAMMAR_REPOSITORY, HASHER } from '../shared/repository-tokens';

/**
 * What the last saved mutation was, so the screen can confirm it out loud.
 *
 * Carries identities rather than sentences: the wording, including how a
 * register is labelled, belongs to the feature layer.
 */
export type GrammarProfileChange =
  | { readonly kind: 'preset'; readonly presetId: GrammarPresetId }
  | { readonly kind: 'register'; readonly registerPreference: RegisterPreference }
  | { readonly kind: 'custom-guidance' }
  | { readonly kind: 'reset-to-preset'; readonly presetId: GrammarPresetId };

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
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);

  private readonly selectionSignal = signal<GrammarProfileSelection>(
    DEFAULT_GRAMMAR_PROFILE_SELECTION,
  );
  private readonly loadedSignal = signal(false);
  private readonly errorSignal = signal<StorageError | null>(null);
  private readonly lastChangeSignal = signal<GrammarProfileChange | null>(null);

  readonly selection = this.selectionSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();
  /** Null until the learner saves a change in this session; loading is not a change. */
  readonly lastChange = this.lastChangeSignal.asReadonly();

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
    return this.write(
      { ...this.selectionSignal(), presetId, customGuidance: undefined },
      {
        kind: 'preset',
        presetId,
      },
    );
  }

  selectRegister(registerPreference: RegisterPreference): Promise<void> {
    return this.write(
      { ...this.selectionSignal(), registerPreference },
      {
        kind: 'register',
        registerPreference,
      },
    );
  }

  setCustomGuidance(guidance: string): Promise<void> {
    const trimmed = guidance.trim().slice(0, MAXIMUM_GUIDANCE_LENGTH);
    const selection = this.selectionSignal();
    return trimmed.length === 0
      ? this.resetToPreset()
      : this.write({ ...selection, customGuidance: trimmed }, { kind: 'custom-guidance' });
  }

  resetToPreset(): Promise<void> {
    const selection = this.selectionSignal();
    return this.write(
      { ...selection, customGuidance: undefined },
      {
        kind: 'reset-to-preset',
        presetId: selection.presetId,
      },
    );
  }

  /**
   * Stores the immutable capture a generated story is judged against.
   *
   * Captures are content addressed, so an unchanged profile resolves to a
   * capture that already exists and the original `capturedAt` is kept rather
   * than being rewritten. Requires a loaded bundle: the preset prose and the
   * baseline version both come from it.
   */
  async captureProfile(): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    const preset = this.selectedPreset();
    const register = this.language.registerGuidance();
    const baselineVersion = this.language.versions()?.structuralBaselineVersion ?? null;
    if (preset === null || register === null || baselineVersion === null) {
      return err(
        storageError(
          'unavailable',
          'The grammar profile cannot be captured until language assets are ready.',
        ),
      );
    }

    const snapshot = captureGrammarProfile(
      this.hasher,
      this.selectionSignal(),
      preset,
      register,
      baselineVersion,
      this.clock.now(),
    );
    const existing = await this.repository.getProfileCapture(snapshot.id);
    if (!existing.ok) {
      this.errorSignal.set(existing.error);
      return existing;
    }
    if (existing.value !== null) {
      return ok(existing.value);
    }
    const stored = await this.repository.captureProfile(snapshot);
    if (!stored.ok) {
      this.errorSignal.set(stored.error);
    }
    return stored;
  }

  private async write(next: GrammarProfileSelection, change: GrammarProfileChange): Promise<void> {
    const saved = await this.repository.setSelection(next);
    if (!saved.ok) {
      // The in-memory selection is left alone so the screen keeps showing what
      // is actually stored, and no change is confirmed.
      this.errorSignal.set(saved.error);
      return;
    }
    this.selectionSignal.set(next);
    this.errorSignal.set(null);
    this.lastChangeSignal.set(change);
  }
}
