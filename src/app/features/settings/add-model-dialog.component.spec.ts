import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ModelCatalog, ModelCapabilities } from '../../domain/ai/model-catalog';
import { ok } from '../../domain/shared/result';
import { MODEL_CATALOG } from '../../application/shared/ai-tokens';
import { AddModelDialogComponent, type AddModelDialogResult } from './add-model-dialog.component';

const GEMINI: ModelCapabilities = {
  modelId: 'google/gemini-test',
  name: 'Gemini Test',
  contextLength: 32_768,
  inputModalities: ['text'],
  outputModalities: ['text'],
  supportedParameters: ['reasoning', 'structured_outputs'],
  supportedVoices: [],
  reasoning: {
    supportedEfforts: ['high', 'low', 'minimal'],
    defaultEffort: 'low',
    defaultEnabled: true,
    mandatory: true,
    supportsMaxTokens: true,
  },
};

describe('AddModelDialogComponent', () => {
  it('discovers text choices and returns a registered preset', async () => {
    const close = vi.fn<(result?: AddModelDialogResult) => void>();
    const catalog: ModelCatalog = { discover: () => Promise.resolve(ok(GEMINI)) };
    await TestBed.configureTestingModule({
      imports: [AddModelDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { kind: 'text' } },
        { provide: DialogRef, useValue: { close } },
        { provide: MODEL_CATALOG, useValue: catalog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddModelDialogComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const modelInput = element.querySelector<HTMLInputElement>('[data-testid="add-model-id"]')!;
    modelInput.value = GEMINI.modelId;
    modelInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="dialog-discover-model"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      element.querySelector<HTMLSelectElement>('[data-testid="reasoning-effort-select"]')!.value,
    ).toBe('low');
    element.querySelector<HTMLButtonElement>('[data-testid="save-model-preset"]')!.click();

    const result = close.mock.calls[0]?.[0];
    expect(result?.kind).toBe('text');
    if (result?.kind === 'text') {
      expect(result.preset.name).toBe('Gemini Test');
      expect(result.preset.modelId).toBe(GEMINI.modelId);
      expect(result.preset.reasoningEffort).toBe('low');
    }
  });

  it('offers Gemini voices as a dropdown and allows the default voice', async () => {
    const close = vi.fn<(result?: AddModelDialogResult) => void>();
    const model = {
      ...GEMINI,
      modelId: 'google/gemini-test-tts',
      outputModalities: ['audio'],
      supportedVoices: ['Kore', 'Puck'],
      reasoning: null,
    };
    const catalog: ModelCatalog = { discover: () => Promise.resolve(ok(model)) };
    await TestBed.configureTestingModule({
      imports: [AddModelDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: { kind: 'tts' } },
        { provide: DialogRef, useValue: { close } },
        { provide: MODEL_CATALOG, useValue: catalog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddModelDialogComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const modelInput = element.querySelector<HTMLInputElement>('[data-testid="add-model-id"]')!;
    modelInput.value = model.modelId;
    modelInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="dialog-discover-model"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="voice-select"]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="save-model-preset"]')!.click();
    const result = close.mock.calls[0]?.[0];
    expect(result?.kind).toBe('tts');
    if (result?.kind === 'tts') {
      expect(result.preset.voiceId).toBe('Kore');
      expect(result.preset.speed).toBe(1);
    }
  });
});
