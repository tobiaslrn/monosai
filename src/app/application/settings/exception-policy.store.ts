import { Injectable, computed, inject, signal } from '@angular/core';
import { exceptionPolicyHash, normalizePolicyText } from '../../domain/ai/exception-policy-hash';
import { DEFAULT_EXCEPTION_POLICY, type ExceptionPolicy } from '../../domain/settings/settings';
import type { StorageError } from '../../domain/storage/storage-error';
import { CLOCK, HASHER, SETTINGS_REPOSITORY } from '../shared/repository-tokens';

export type PolicyAction = 'idle' | 'saving';

/** Longest policy accepted, so one field cannot crowd out a generation request. */
export const MAX_POLICY_LENGTH = 2_000;

/**
 * The single global exception policy.
 *
 * It only ever applies to generation, where it is captured immutably onto each
 * story: editing it afterwards changes what future stories are judged against
 * and never rewrites what an earlier story was allowed.
 */
@Injectable({ providedIn: 'root' })
export class ExceptionPolicyStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);

  private readonly policySignal = signal<ExceptionPolicy>(DEFAULT_EXCEPTION_POLICY);
  private readonly draftSignal = signal('');
  private readonly actionSignal = signal<PolicyAction>('idle');
  private readonly failureSignal = signal<StorageError | null>(null);
  private readonly savedSignal = signal(false);

  readonly policy = this.policySignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  /** True after a successful save, until the text is edited again. */
  readonly justSaved = this.savedSignal.asReadonly();

  readonly isTooLong = computed(() => this.draftSignal().length > MAX_POLICY_LENGTH);

  readonly hasUnsavedChanges = computed(
    () => normalizePolicyText(this.draftSignal()) !== this.policySignal().text,
  );

  async load(): Promise<void> {
    const policy = await this.repository.getExceptionPolicy();
    if (!policy.ok) {
      this.failureSignal.set(policy.error);
      return;
    }
    this.policySignal.set(policy.value);
    this.draftSignal.set(policy.value.text);
    this.failureSignal.set(null);
  }

  setDraft(text: string): void {
    this.draftSignal.set(text);
    this.savedSignal.set(false);
  }

  async save(): Promise<boolean> {
    if (this.isTooLong()) {
      return false;
    }
    const text = normalizePolicyText(this.draftSignal());

    this.actionSignal.set('saving');
    const saved = await this.repository.updateExceptionPolicy({
      text,
      policyHash: exceptionPolicyHash(this.hasher, text),
      updatedAt: this.clock.now(),
    });
    this.actionSignal.set('idle');

    if (!saved.ok) {
      this.failureSignal.set(saved.error);
      return false;
    }
    this.policySignal.set(saved.value);
    this.draftSignal.set(saved.value.text);
    this.failureSignal.set(null);
    this.savedSignal.set(true);
    return true;
  }
}
