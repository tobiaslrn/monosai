import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GrammarRepository } from '../../domain/grammar/grammar-repository';
import {
  DEFAULT_GRAMMAR_PRESET_ID,
  type GrammarPreset,
  type RegisterGuidance,
} from '../../domain/grammar/presets';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../../domain/grammar/profile';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { ok, err, type Result } from '../../domain/shared/result';
import { storageError, type StorageError } from '../../domain/storage/storage-error';
import { LanguageStore } from '../language/language.store';
import { CLOCK, GRAMMAR_REPOSITORY, HASHER } from '../shared/repository-tokens';
import { GrammarProfileStore } from './grammar-profile.store';

const BASELINE_VERSION = '1.0.0';

const REGISTER: RegisterGuidance = {
  spoken: 'Prefer everyday spoken register.',
  written: 'Prefer polite written register.',
  either: '',
};

const PRESETS: readonly GrammarPreset[] = [
  {
    id: 'mn-preset-starter',
    order: 0,
    nameEn: 'Starter forms',
    captionEn: 'the first patterns in any course',
    descriptionEn: 'Single short sentences.',
    exampleJa: '私は学生です。',
    exampleEn: 'I am a student.',
    promptGuidance: 'Write single short clauses.',
  },
  {
    id: 'mn-preset-everyday',
    order: 2,
    nameEn: 'Everyday forms',
    captionEn: 'usually taught around N4',
    descriptionEn: 'Ordinary writing.',
    exampleJa: '本を読んでみたら面白かった。',
    exampleEn: 'The book was interesting.',
    promptGuidance: 'Write at roughly N4 complexity.',
  },
];

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/** In-memory `GrammarRepository` whose next call can be made to fail. */
class FakeGrammarRepository implements GrammarRepository {
  selection: GrammarProfileSelection = DEFAULT_GRAMMAR_PROFILE_SELECTION;
  readonly captures = new Map<string, GrammarProfileSnapshot>();
  failWith: StorageError | null = null;

  getSelection(): Promise<Result<GrammarProfileSelection, StorageError>> {
    return Promise.resolve(this.failWith ? err(this.failWith) : ok(this.selection));
  }

  setSelection(selection: GrammarProfileSelection): Promise<Result<void, StorageError>> {
    if (this.failWith) {
      return Promise.resolve(err(this.failWith));
    }
    this.selection = selection;
    return Promise.resolve(ok(undefined));
  }

  captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    if (this.failWith) {
      return Promise.resolve(err(this.failWith));
    }
    this.captures.set(snapshot.id, snapshot);
    return Promise.resolve(ok(snapshot));
  }

  getProfileCapture(id: string): Promise<Result<GrammarProfileSnapshot | null, StorageError>> {
    if (this.failWith) {
      return Promise.resolve(err(this.failWith));
    }
    return Promise.resolve(ok(this.captures.get(id) ?? null));
  }
}

describe('GrammarProfileStore', () => {
  let repository: FakeGrammarRepository;
  let presets: ReturnType<typeof signal<readonly GrammarPreset[]>>;

  /**
   * The store reads presets, register guidance, and the baseline version from
   * `LanguageStore`; only those three members are stubbed, so a change to the
   * real store's asset handling cannot silently pass here.
   */
  function stubLanguageStore(): unknown {
    presets = signal<readonly GrammarPreset[]>(PRESETS);
    return {
      grammarPresets: presets,
      registerGuidance: signal<RegisterGuidance | null>(REGISTER),
      versions: signal({ structuralBaselineVersion: BASELINE_VERSION }),
    };
  }

  function createStore(): GrammarProfileStore {
    return TestBed.inject(GrammarProfileStore);
  }

  beforeEach(() => {
    repository = new FakeGrammarRepository();
    TestBed.configureTestingModule({
      providers: [
        GrammarProfileStore,
        { provide: GRAMMAR_REPOSITORY, useValue: repository },
        { provide: LanguageStore, useValue: stubLanguageStore() },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  describe('load', () => {
    it('seeds a fresh install with the easiest preset and a neutral register', async () => {
      const store = createStore();

      await store.load();

      expect(store.selection().presetId).toBe(DEFAULT_GRAMMAR_PRESET_ID);
      expect(store.selection().registerPreference).toBe('either');
      expect(store.loaded()).toBe(true);
      expect(store.lastChange()).toBeNull();
    });

    it('surfaces a read failure without claiming to be loaded', async () => {
      repository.failWith = storageError('unavailable', 'no database');
      const store = createStore();

      await store.load();

      expect(store.lastError()?.code).toBe('unavailable');
      expect(store.loaded()).toBe(false);
    });
  });

  describe('mutations', () => {
    it('persists a preset change and re-reads it', async () => {
      const store = createStore();
      await store.load();

      await store.selectPreset('mn-preset-everyday');

      expect(repository.selection.presetId).toBe('mn-preset-everyday');
      expect(store.lastChange()).toEqual({ kind: 'preset', presetId: 'mn-preset-everyday' });

      const reloaded = createStore();
      await reloaded.load();
      expect(reloaded.selection().presetId).toBe('mn-preset-everyday');
    });

    it('persists a register change and folds it into the resolved guidance', async () => {
      const store = createStore();
      await store.load();

      await store.selectRegister('written');

      expect(repository.selection.registerPreference).toBe('written');
      expect(store.resolvedGuidance()).toBe(
        'Write single short clauses. Prefer polite written register.',
      );
      expect(store.lastChange()).toEqual({ kind: 'register', registerPreference: 'written' });
    });

    it('persists custom guidance, then restores the preset prose on reset', async () => {
      const store = createStore();
      await store.load();

      await store.setCustomGuidance('  Only very short sentences.  ');

      expect(repository.selection.customGuidance).toBe('Only very short sentences.');
      expect(store.isCustomGuidance()).toBe(true);
      expect(store.resolvedGuidance()).toBe('Only very short sentences.');

      await store.resetToPreset();

      expect(repository.selection.customGuidance).toBeUndefined();
      expect(store.isCustomGuidance()).toBe(false);
      expect(store.resolvedGuidance()).toBe('Write single short clauses.');
      expect(store.lastChange()).toEqual({
        kind: 'reset-to-preset',
        presetId: DEFAULT_GRAMMAR_PRESET_ID,
      });
    });

    it('rejects custom guidance beyond the bound rather than storing it whole', async () => {
      const store = createStore();
      await store.load();

      await store.setCustomGuidance('あ'.repeat(1200));

      expect(store.selection().customGuidance).toHaveLength(1000);
      expect(repository.selection.customGuidance).toHaveLength(1000);
    });

    it('treats blank custom guidance as a reset rather than an empty override', async () => {
      const store = createStore();
      await store.load();
      await store.setCustomGuidance('Only very short sentences.');

      await store.setCustomGuidance('   ');

      expect(store.isCustomGuidance()).toBe(false);
      expect(repository.selection.customGuidance).toBeUndefined();
    });

    it('drops a fork when the learner moves to another preset', async () => {
      const store = createStore();
      await store.load();
      await store.setCustomGuidance('Only very short sentences.');

      await store.selectPreset('mn-preset-everyday');

      expect(store.isCustomGuidance()).toBe(false);
      expect(store.resolvedGuidance()).toBe('Write at roughly N4 complexity.');
    });

    it('surfaces a failed write and leaves the previous selection intact', async () => {
      const store = createStore();
      await store.load();
      repository.failWith = storageError('quota', 'disk full');

      await store.selectPreset('mn-preset-everyday');

      expect(store.lastError()?.code).toBe('quota');
      expect(store.selection().presetId).toBe(DEFAULT_GRAMMAR_PRESET_ID);
      expect(repository.selection.presetId).toBe(DEFAULT_GRAMMAR_PRESET_ID);
      expect(store.lastChange()).toBeNull();
    });
  });

  describe('captureProfile', () => {
    it('captures exactly the guidance the prompt would send', async () => {
      const store = createStore();
      await store.load();
      await store.selectRegister('spoken');

      const captured = await store.captureProfile();

      expect(captured.ok).toBe(true);
      if (!captured.ok) {
        return;
      }
      expect(captured.value.resolvedGuidance).toBe(store.resolvedGuidance());
      expect(captured.value).toMatchObject({
        presetId: DEFAULT_GRAMMAR_PRESET_ID,
        registerPreference: 'spoken',
        isCustomGuidance: false,
        structuralBaselineVersion: BASELINE_VERSION,
        capturedAt: 1_700_000_000_000,
      });
      expect(repository.captures.get(captured.value.id)).toEqual(captured.value);
    });

    it('reuses an existing capture instead of rewriting an identical profile', async () => {
      const store = createStore();
      await store.load();

      const first = await store.captureProfile();
      const second = await store.captureProfile();

      expect(first.ok && second.ok && first.value.id === second.value.id).toBe(true);
      expect(repository.captures.size).toBe(1);
    });

    it('refuses to capture before the language bundle is ready', async () => {
      const store = createStore();
      await store.load();
      presets.set([]);

      const captured = await store.captureProfile();

      expect(captured.ok).toBe(false);
      if (captured.ok) {
        return;
      }
      expect(captured.error.code).toBe('unavailable');
      expect(repository.captures.size).toBe(0);
    });

    it('surfaces a storage failure on lastError', async () => {
      const store = createStore();
      await store.load();
      repository.failWith = storageError('transaction-aborted', 'aborted');

      const captured = await store.captureProfile();

      expect(captured.ok).toBe(false);
      expect(store.lastError()?.code).toBe('transaction-aborted');
    });
  });
});
