import { Injectable, computed, inject, signal } from '@angular/core';
import { captureGrammarProfile, grammarProfileHash } from '../../domain/grammar/profile-hash';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  applicableSelection,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../../domain/grammar/profile';
import {
  resolveGuidance,
  type GrammarPreset,
  type GrammarPresetId,
} from '../../domain/grammar/presets';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { LanguageStore } from '../language/language.store';
import { CLOCK, GRAMMAR_REPOSITORY, HASHER } from '../shared/repository-tokens';

/**
 * What the last saved change was, so the screen can confirm it out loud.
 *
 * Carries the identity rather than a sentence: the wording belongs to the
 * feature layer.
 */
export interface GrammarProfileChange {
  readonly kind: 'preset';
  readonly presetId: GrammarPresetId;
}

/**
 * Owns the live grammar profile.
 *
 * A preset is always set, so unlike the per-rule selection this replaced the
 * profile is never empty and generation is never gated on it. The profile is
 * the preset alone: every register is allowed and the preset's prose is what is
 * sent (ADR 0064). Writes are saved immediately; a failed write surfaces a typed
 * error and leaves the stored profile untouched.
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

  /** The applied profile; a register or edited guidance in an older record is not part of it. */
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
    );
  });

  /**
   * The hash the live profile would produce if a story were generated now.
   *
   * Stored grammar analyses record the profile hash they were judged against,
   * so comparing against this is how an imported reading's analysis is known to
   * predate the current profile. Null until the language bundle is loaded,
   * because the structural baseline version is part of what is hashed and
   * guessing it would produce a hash that matches nothing.
   */
  readonly liveProfileHash = computed(() => {
    const baselineVersion = this.language.versions()?.structuralBaselineVersion ?? null;
    const resolvedGuidance = this.resolvedGuidance();
    if (baselineVersion === null || resolvedGuidance === '') {
      return null;
    }
    return grammarProfileHash(this.hasher, {
      resolvedGuidance,
      registerPreference: this.selectionSignal().registerPreference,
      structuralBaselineVersion: baselineVersion,
    });
  });

  async load(): Promise<void> {
    const loaded = await this.repository.getSelection();
    if (!loaded.ok) {
      this.errorSignal.set(loaded.error);
      return;
    }
    this.selectionSignal.set(applicableSelection(loaded.value));
    this.loadedSignal.set(true);
    this.errorSignal.set(null);
  }

  /** Saves the preset alone, which also clears a register or wording an older record kept. */
  async selectPreset(presetId: GrammarPresetId): Promise<void> {
    const next = applicableSelection({ ...this.selectionSignal(), presetId });
    const saved = await this.repository.setSelection(next);
    if (!saved.ok) {
      // The in-memory selection is left alone so the screen keeps showing what
      // is actually stored, and no change is confirmed.
      this.errorSignal.set(saved.error);
      return;
    }
    this.selectionSignal.set(next);
    this.errorSignal.set(null);
    this.lastChangeSignal.set({ kind: 'preset', presetId });
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
}
