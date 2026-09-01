import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
import type { SpeechCapabilities } from '../../domain/ai/speech-capabilities';
import type { ModelCapabilities, ModelCatalog } from '../../domain/ai/model-catalog';
import { fixedClock } from '../../domain/shared/clock';
import type { Hasher } from '../../domain/shared/hashing';
import { ok, type Result } from '../../domain/shared/result';
import { ModelPickerComponent } from './model-picker.component';
import { ModelsSectionComponent } from './models-section.component';

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };
const CONFIGURED = { modelId: FAKE_OPENROUTER.ttsModel, voiceId: FAKE_OPENROUTER.voice };

const SPEECH_MODEL: ModelCapabilities = {
  modelId: FAKE_OPENROUTER.ttsModel,
  name: 'Fake speech',
  contextLength: null,
  inputModalities: ['text'],
  outputModalities: ['audio'],
  supportedParameters: ['speed'],
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
describe('ModelsSectionComponent audio readiness', () => {
  let settings: StubAiSettingsRepository;
  let provider: StubTtsProvider;

  beforeEach(() => {
    // jsdom has no media pipeline, and the preview plays its clip as soon as
    // one lands. What is under test is what the panel says, not the sound.
    HTMLMediaElement.prototype.play = (): Promise<void> => Promise.resolve();
    settings = new StubAiSettingsRepository();
    provider = new StubTtsProvider(ok(ttsTest()));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
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
    fixture: ComponentFixture<ModelsSectionComponent>;
  }> {
    const credential = TestBed.inject(CredentialStore);
    await credential.load();
    const tts = TestBed.inject(TtsStore);
    await tts.load();
    await TestBed.inject(TextModelStore).load();
    const fixture = TestBed.createComponent(ModelsSectionComponent);
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

  function readiness(element: HTMLElement): string {
    return textOf(element, 'audio-readiness');
  }

  function note(element: HTMLElement): string {
    return textOf(element, 'audio-readiness-note');
  }

  /** The speed box, which the panel always renders. */
  function speedField(element: HTMLElement): HTMLInputElement {
    const field = element.querySelector<HTMLInputElement>('[data-testid="tts-speed-input"]');
    if (field === null) {
      throw new Error('the audio panel rendered no speed field');
    }
    return field;
  }

  async function connect(): Promise<void> {
    await TestBed.inject(CredentialStore).save('sk-or-test');
  }

  it('says there is no model before one is chosen', async () => {
    const { element } = await render();

    expect(readiness(element)).toBe('No model');
    expect(note(element)).toBe('');
  });

  it('says a chosen model has not been tested, and why the preview is a press', async () => {
    await connect();
    const { element, tts, detect } = await render();

    tts.setDraft(CONFIGURED);
    await tts.save();
    detect();

    expect(readiness(element)).toBe('Not tested');
    expect(note(element)).toContain('Preview plays one test sentence');
  });

  it('says it is playing while the preview runs, and offers a way to stop it', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft(CONFIGURED);
    await tts.save();
    provider.testConfiguration = (_config, signal) =>
      new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          resolve({ ok: false, error: aiError('cancelled', 'tts-test', 'cancelled') });
        });
      });

    const pending = tts.test();
    await Promise.resolve();
    detect();

    expect(readiness(element)).toBe('Playing…');
    const stop = element.querySelector<HTMLButtonElement>('[data-testid="cancel-tts-test"]');
    expect(stop).not.toBeNull();
    expect(element.querySelector('[data-testid="test-tts"]')).toBeNull();

    stop?.click();
    await pending;
    detect();

    expect(readiness(element)).toBe('Stopped');
    expect(note(element)).toContain('still untested');
    expect(element.querySelector('[data-testid="test-tts"]')).not.toBeNull();
  });

  it('says a model is ready once its preview has passed', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft(CONFIGURED);

    await tts.test();
    detect();

    expect(readiness(element)).toBe('Ready');
    expect(note(element)).toBe('');
  });

  it('says a preview failed', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft(CONFIGURED);
    provider.result = {
      ok: false,
      error: aiError('capability-unsupported', 'tts-test', 'no voice'),
    };

    await tts.test();
    detect();

    expect(readiness(element)).toBe('Failed');
  });

  /**
   * The scenario the whole panel exists for: the voice changed, coverage in the
   * reader fell to zero, and nothing anywhere said the word "voice".
   */
  it('says the settings changed, and that the old clips are kept', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft(CONFIGURED);
    await tts.test();

    tts.setDraft({ voiceId: 'kaede' });
    await tts.save();
    detect();

    expect(readiness(element)).toBe('Settings changed');
    expect(note(element)).toContain('Audio saved with the previous settings is kept');
  });

  it('keeps the saved speed when the field is cleared, and says the value is unusable', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft({ ...CONFIGURED, speed: 1.5 });
    await tts.test();
    detect();
    const speed = speedField(element);
    expect(speed.value).toBe('1.5');

    speed.value = '';
    speed.dispatchEvent(new Event('input'));
    speed.dispatchEvent(new Event('change'));
    detect();

    expect(settings.tts.speed).toBe(1.5);
    expect(tts.readiness()).toBe('ready');
    expect(speed.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('between 0.5 and 2');
  });

  it('commits a speed the field accepts', async () => {
    await connect();
    const { element, tts, detect } = await render();
    tts.setDraft(CONFIGURED);
    await tts.test();
    detect();
    const speed = speedField(element);

    speed.value = '1.25';
    speed.dispatchEvent(new Event('input'));
    speed.dispatchEvent(new Event('change'));
    // The commit writes through the store, so the panel catches up a tick later.
    await Promise.resolve();
    await Promise.resolve();
    detect();

    expect(settings.tts.speed).toBe(1.25);
    expect(readiness(element)).toBe('Settings changed');
  });
  /**
   * The readiness states above are reached by writing to the store. A learner
   * reaches them by operating the panel, and the handlers between the two are
   * where a control can be wired to nothing and still look right on screen.
   */
  describe('driven through its own controls', () => {
    /** The audio node's picker, which reports a choice rather than making it. */
    function audioPicker(fixture: ComponentFixture<ModelsSectionComponent>): ModelPickerComponent {
      const pickers = fixture.debugElement.queryAll(By.directive(ModelPickerComponent));
      const audio = pickers.find(
        (picker) =>
          (picker.nativeElement as HTMLElement).getAttribute('data-testid') ===
          'audio-model-picker',
      );
      if (audio === undefined) {
        throw new Error('the audio panel rendered no model picker');
      }
      return audio.componentInstance as ModelPickerComponent;
    }

    /** Drains the store's persist-then-call chain, which no control awaits. */
    async function settled(): Promise<void> {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    function voiceControl(element: HTMLElement): HTMLSelectElement {
      const control = element.querySelector<HTMLSelectElement>(
        'select[aria-labelledby="mn-voice-label"]',
      );
      if (control === null) {
        throw new Error('the audio panel rendered no voice control');
      }
      return control;
    }

    it('saves the picked model with its first voice, and leaves it untested', async () => {
      await connect();
      const { element, tts, detect, fixture } = await render();

      audioPicker(fixture).modelSelected.emit(SPEECH_MODEL);
      await Promise.resolve();
      await Promise.resolve();
      detect();

      expect(tts.settings().modelId).toBe(FAKE_OPENROUTER.ttsModel);
      // The first supported voice, so the model is usable without a second choice.
      expect(tts.settings().voiceId).toBe(FAKE_OPENROUTER.voice);
      expect(settings.tts.modelId).toBe(FAKE_OPENROUTER.ttsModel);
      expect(readiness(element)).toBe('Not tested');
    });

    it('saves a voice chosen from the model list', async () => {
      await connect();
      const { element, tts, detect } = await render();
      tts.setDraft(CONFIGURED);
      await tts.test();
      detect();

      const voice = voiceControl(element);
      voice.value = 'kaede';
      voice.dispatchEvent(new Event('change'));
      await Promise.resolve();
      await Promise.resolve();
      detect();

      expect(settings.tts.voiceId).toBe('kaede');
      // A changed voice does not delete the clips it can no longer reach.
      expect(readiness(element)).toBe('Settings changed');
      expect(note(element)).toContain('kept');
    });

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

    it('takes a typed voice when the catalogue does not know the model', async () => {
      await connect();
      const { element, tts, detect } = await render();

      // A model the catalogue cannot describe still has to be configurable:
      // the catalogue is fetched lazily and may never answer.
      tts.setDraft({ modelId: 'private/speech', voiceId: 'nova' });
      await tts.save();
      detect();

      expect(element.querySelector('select[aria-labelledby="mn-voice-label"]')).toBeNull();
      const typed = element.querySelector<HTMLInputElement>(
        'input[aria-labelledby="mn-voice-label"]',
      );
      expect(typed).not.toBeNull();
      expect(typed?.value).toBe('nova');

      if (typed !== null) {
        typed.value = 'shimmer';
        typed.dispatchEvent(new Event('change'));
      }
      await settled();
      detect();

      expect(settings.tts.voiceId).toBe('shimmer');
    });

    it('previews from the button, with the parameters the catalogue reports', async () => {
      await connect();
      const { element, tts, detect } = await render();
      tts.setDraft(CONFIGURED);
      await tts.save();
      detect();
      let attempted: SpeechCapabilities | undefined;
      const passing = provider.testConfiguration.bind(provider);
      provider.testConfiguration = (config, signal) => {
        attempted = config.attempt;
        return passing(config, signal);
      };

      element.querySelector<HTMLButtonElement>('[data-testid="test-tts"]')?.click();
      // The button starts the test without awaiting it, so the panel only
      // catches up once the store has persisted the draft and heard back.
      await settled();
      detect();

      // The catalogue declares speed for this model, so the preview attempts it.
      expect(attempted?.speed).toBe(true);
      expect(readiness(element)).toBe('Ready');
    });

    it('plays the sample clip once the element can play it', async () => {
      await connect();
      const { element, tts, detect } = await render();
      tts.setDraft(CONFIGURED);
      await tts.test();
      detect();

      let played = 0;
      HTMLMediaElement.prototype.play = (): Promise<void> => {
        played += 1;
        return Promise.resolve();
      };
      const sample = element.querySelector('audio');
      expect(sample).not.toBeNull();
      sample?.dispatchEvent(new Event('canplay'));

      expect(played).toBe(1);
    });

    it('does not let a refused sample reject into the console', async () => {
      await connect();
      const { element, tts, detect } = await render();
      tts.setDraft(CONFIGURED);
      await tts.test();
      detect();

      HTMLMediaElement.prototype.play = (): Promise<void> =>
        Promise.reject(new Error('autoplay refused'));
      element.querySelector('audio')?.dispatchEvent(new Event('canplay'));
      await Promise.resolve();
      await Promise.resolve();

      // A browser that refuses autoplay leaves the panel exactly as it was.
      expect(readiness(element)).toBe('Ready');
    });
  });
});
