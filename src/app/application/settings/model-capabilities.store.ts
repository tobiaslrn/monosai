import { Injectable, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { MODEL_CATALOG } from '../shared/ai-tokens';

export type CapabilityTarget = 'text' | 'tts';
export interface CapabilityState {
  readonly action: 'idle' | 'loading';
  readonly result: ModelCapabilities | null;
  readonly failure: AiError | null;
}

const EMPTY: CapabilityState = { action: 'idle', result: null, failure: null };

@Injectable({ providedIn: 'root' })
export class ModelCapabilitiesStore {
  private readonly catalog = inject(MODEL_CATALOG);
  private readonly textSignal = signal<CapabilityState>(EMPTY);
  private readonly ttsSignal = signal<CapabilityState>(EMPTY);
  private readonly controllers = new Map<CapabilityTarget, AbortController>();

  readonly text = this.textSignal.asReadonly();
  readonly tts = this.ttsSignal.asReadonly();

  clear(target: CapabilityTarget): void {
    this.controllers.get(target)?.abort();
    this.controllers.delete(target);
    (target === 'text' ? this.textSignal : this.ttsSignal).set(EMPTY);
  }

  async discover(target: CapabilityTarget, modelId: string): Promise<void> {
    this.controllers.get(target)?.abort();
    const controller = new AbortController();
    this.controllers.set(target, controller);
    const state = target === 'text' ? this.textSignal : this.ttsSignal;
    state.set({ action: 'loading', result: null, failure: null });
    const result = await this.catalog.discover(modelId, controller.signal);
    if (this.controllers.get(target) !== controller) {
      return;
    }
    this.controllers.delete(target);
    state.set(
      result.ok
        ? { action: 'idle', result: result.value, failure: null }
        : { action: 'idle', result: null, failure: result.error },
    );
  }
}
