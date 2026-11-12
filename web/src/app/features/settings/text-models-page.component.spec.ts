import { optionValues, selectedValue } from '../../../testing/select';
import { Dialog } from '@angular/cdk/dialog';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCredentialRepository,
  modelTest,
  StubAiSettingsRepository,
  StubTextProvider,
  StubTtsProvider,
  ttsTest,
} from '../../../testing/ai-fakes';
import { FAKE_OPENROUTER } from '../../../testing/openrouter-server';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import {
  MODEL_CATALOG,
  TEXT_GENERATION_PROVIDER,
  TEXT_TO_SPEECH_PROVIDER,
} from '../../application/shared/ai-tokens';
import {
  CLOCK,
  CREDENTIAL_REPOSITORY,
  HASHER,
  SETTINGS_REPOSITORY,
} from '../../application/shared/repository-tokens';
import { aiError } from '../../domain/ai/ai-error';
import type { ModelCapabilities, ModelCatalog } from '../../domain/ai/model-catalog';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { err, ok, type Result } from '../../domain/shared/result';
import { ModelCatalogView } from './model-catalog-view';
import { TextModelsPageComponent } from './text-models-page.component';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

const SPEECH_MODEL: ModelCapabilities = {
  modelId: FAKE_OPENROUTER.ttsModel,
  name: 'Fake speech',
  contextLength: null,
  maxCompletionTokens: null,
  inputModalities: ['text'],
  outputModalities: ['audio'],
  supportedParameters: ['instructions'],
  supportedVoices: [FAKE_OPENROUTER.voice, 'kaede'],
  reasoning: null,
};

/** Enough of a catalogue for the audio node to render its own model. */
class StubCatalog implements ModelCatalog {
  list(output: 'text' | 'speech'): Promise<Result<readonly ModelCapabilities[], never>> {
    return Promise.resolve(ok(output === 'speech' ? [SPEECH_MODEL] : []));
  }
}

/**
 * What the Audio panel says about itself.
 *
 * Every one of these states existed in the store before this suite: readiness
 * was computed, stored, and never rendered, so a learner who chose a speech
 * model and never pressed Preview had audio that could not be generated and no
 * screen anywhere that said so.
 */
describe('TextModelsPageComponent', () => {
  let settings: StubAiSettingsRepository;
  let provider: StubTtsProvider;

  beforeEach(() => {
    // jsdom has no media pipeline, and the preview plays its clip as soon as
    // one lands. What is under test is what the panel says, not the sound.
    HTMLMediaElement.prototype.play = (): Promise<void> => Promise.resolve();
    settings = new StubAiSettingsRepository();
    provider = new StubTtsProvider(ok(ttsTest(true)));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ModelCatalogView,
        provideRouter([]),
        { provide: SETTINGS_REPOSITORY, useValue: settings },
        { provide: CREDENTIAL_REPOSITORY, useValue: new FakeCredentialRepository() },
        { provide: TEXT_TO_SPEECH_PROVIDER, useValue: provider },
        { provide: TEXT_GENERATION_PROVIDER, useValue: new StubTextProvider(ok(modelTest())) },
        { provide: MODEL_CATALOG, useValue: new StubCatalog() },
        { provide: HASHER, useValue: HASH },
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
      ],
    });
  });

  async function render(): Promise<{
    element: HTMLElement;
    tts: TtsStore;
    detect: () => void;
    fixture: ComponentFixture<TextModelsPageComponent>;
  }> {
    const credential = TestBed.inject(CredentialStore);
    await credential.load();
    const tts = TestBed.inject(TtsStore);
    await tts.load();
    await TestBed.inject(TextModelStore).load();
    const fixture = TestBed.createComponent(TextModelsPageComponent);
    fixture.detectChanges();
    return {
      element: fixture.nativeElement as HTMLElement,
      tts,
      detect: () => {
        fixture.detectChanges();
      },
      fixture,
    };
  }

  function textOf(element: HTMLElement, testId: string): string {
    return element.querySelector(`[data-testid="${testId}"]`)?.textContent.trim() ?? '';
  }

  async function connect(): Promise<void> {
    await TestBed.inject(CredentialStore).save('sk-or-test');
  }
  it('says there is no model before one is chosen', async () => {
    const { element } = await render();

    expect(textOf(element, 'text-readiness')).toBe('');
  });

  it('gives Text, Translation, and Grammar each their own header and status', async () => {
    await connect();
    const { element, fixture } = await render();
    const headings = (): string[] =>
      [...element.querySelectorAll('.mn-group-title')].map((title) => title.textContent.trim());

    expect(headings()).toEqual(['Text model', 'Translation', 'Grammar']);
    // A task with no model of its own says nothing: the text model's line covers it.
    expect(element.querySelector('[data-testid="translation-readiness"]')).toBeNull();
    expect(element.querySelector('[data-testid="grammar-readiness"]')).toBeNull();

    await TestBed.inject(TextModelStore).setTaskModel('translation', {
      modelId: 'test/text',
      name: 'Text',
      reasoningEffort: null,
    });
    fixture.detectChanges();

    expect(textOf(element, 'translation-readiness')).toContain('Not tested');
    // Its own reasoning and limit sit under its own header, not the text model's.
    const cluster = element.querySelector('[data-capability="translation"]');
    expect(cluster?.querySelector('.mn-group-title')?.textContent.trim()).toBe('Translation');
    expect(cluster?.textContent).toContain('Reasoning');
  });

  it('restores saved reasoning for the main model and override after the catalogue arrives', async () => {
    let resolveModels!: (value: Result<readonly ModelCapabilities[], never>) => void;
    const pending = new Promise<Result<readonly ModelCapabilities[], never>>((resolve) => {
      resolveModels = resolve;
    });
    TestBed.overrideProvider(MODEL_CATALOG, {
      useValue: {
        list: (output: string) => (output === 'text' ? pending : Promise.resolve(ok([]))),
      },
    });
    settings.textModel = { ...settings.textModel, modelId: 'test/text', reasoningEffort: 'medium' };
    await connect();
    const { element, fixture } = await render();
    await TestBed.inject(TextModelStore).setTaskModel('translation', {
      modelId: 'test/text',
      name: 'Text',
      reasoningEffort: 'medium',
    });
    fixture.detectChanges();
    resolveModels(
      ok([
        {
          ...SPEECH_MODEL,
          modelId: 'test/text',
          outputModalities: ['text'],
          reasoning: {
            supportedEfforts: ['low', 'medium', 'high'],
            defaultEffort: null,
            defaultEnabled: null,
            mandatory: false,
            supportsMaxTokens: false,
          },
        },
      ]),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    const selects = [...element.querySelectorAll<HTMLElement>('[role="combobox"]')].filter(
      (select) => optionValues(select).includes('medium'),
    );
    expect(selects).toHaveLength(2);
    expect(selects.map((select) => selectedValue(select))).toEqual(['medium', 'medium']);
  });

  describe('fetching the catalogue', () => {
    /** A catalogue that counts how often it is asked, and can fail the first time. */
    function countingCatalog(failFirst = false): { asked: () => number } {
      let asked = 0;
      TestBed.overrideProvider(MODEL_CATALOG, {
        useValue: {
          list: (output: 'text' | 'speech') => {
            if (output === 'text') {
              asked += 1;
            }
            return Promise.resolve(
              failFirst && asked === 1
                ? err(aiError('rate-limited', 'translation', 'Too many requests.'))
                : ok(output === 'speech' ? [SPEECH_MODEL] : []),
            );
          },
        } satisfies ModelCatalog,
      });
      return { asked: () => asked };
    }

    it('fetches it as soon as a key is configured, without a picker being opened', async () => {
      const catalog = countingCatalog();
      await connect();
      const { fixture } = await render();
      await fixture.whenStable();

      expect(catalog.asked()).toBe(1);
    });

    it('fetches it when the key arrives after the panel is already open', async () => {
      const catalog = countingCatalog();
      TestBed.overrideProvider(CREDENTIAL_REPOSITORY, {
        useValue: new FakeCredentialRepository(null),
      });
      const { fixture } = await render();
      await fixture.whenStable();
      expect(catalog.asked()).toBe(0);

      await connect();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(catalog.asked()).toBe(1);
    });

    it('asks again only when a picker opens after a failure', async () => {
      const catalog = countingCatalog(true);
      await connect();
      const { element, fixture } = await render();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(catalog.asked()).toBe(1);

      const row = element.querySelector<HTMLButtonElement>('[data-testid="text-model-picker"]')!;
      row.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(catalog.asked()).toBe(2);
      expect(document.querySelector('mn-model-picker-dialog')).not.toBeNull();

      TestBed.inject(Dialog).closeAll();
      row.click();
      await fixture.whenStable();

      expect(catalog.asked()).toBe(2);
      TestBed.inject(Dialog).closeAll();
    });
  });

  it('uses the selected model maximum for the story token field', async () => {
    TestBed.overrideProvider(MODEL_CATALOG, {
      useValue: {
        list: (output: string) =>
          Promise.resolve(
            ok(
              output === 'text'
                ? [
                    {
                      ...SPEECH_MODEL,
                      modelId: 'test/text',
                      name: 'Text',
                      outputModalities: ['text'],
                      maxCompletionTokens: 65_536,
                    },
                  ]
                : [],
            ),
          ),
      },
    });
    settings.textModel = { ...settings.textModel, modelId: 'test/text' };
    await connect();
    const { element, fixture } = await render();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain('16,384 · up to 65,536');

    element.querySelector<HTMLButtonElement>('[data-testid="story-token-limit"]')!.click();
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    const dialog = document.querySelector('mn-field-dialog')!;
    const field = dialog.querySelector<HTMLInputElement>('input')!;
    const save = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(dialog.textContent).toContain('Up to 65,536 tokens');

    field.value = '65537';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dialog.textContent).toContain('Enter 4,096 to 65,536');
    expect(save.disabled).toBe(true);
    expect(settings.textModel.storyTokenBudget).toBe(16_384);

    field.value = '65536';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    save.click();
    // The dialog leaves before it closes, and the value is kept once it has.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settings.textModel.storyTokenBudget).toBe(65_536);
    fixture.detectChanges();
    expect(element.textContent).toContain('65,536 · up to 65,536');
  });

  describe('retesting', () => {
    /** Drains the store's persist-then-call chain, which no control awaits. */
    async function settled(): Promise<void> {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    it('offers the same readiness word to the text panel, and retests from it', async () => {
      await connect();
      // A stored text model nothing has tested: the state the panel exists to
      // name, and the one a learner lands in after choosing a model offline.
      settings.textModel = { ...settings.textModel, modelId: 'private/text' };
      const { element, detect } = await render();

      const retest = element.querySelector<HTMLButtonElement>('[data-testid="test-text-model"]');
      expect(retest).not.toBeNull();
      expect(retest?.textContent.trim()).toBe('Test now');

      retest?.click();
      await settled();
      detect();

      // Whatever the provider answers, the label never stays on the invitation.
      expect(element.querySelector('[data-testid="test-text-model"]')?.textContent.trim()).not.toBe(
        'Test now',
      );
    });
  });
});
