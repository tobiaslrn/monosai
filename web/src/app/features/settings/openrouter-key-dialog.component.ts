import type { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DialogComponent, dialogResult, openDialog } from '../../shared-ui/dialog/dialog';
import { SecretFieldComponent } from '../../shared-ui/secret-field/secret-field.component';

export interface OpenRouterKeyDialogData {
  /** Whether a test came back saying OpenRouter does not accept the saved key. */
  readonly refused: () => boolean;
}

/** What the dialog ended with: a key was kept, or the learner asked to delete the saved one. */
export type OpenRouterKeyOutcome = 'saved' | 'delete';

/**
 * The OpenRouter key: what it is for and where one comes from, a secret field
 * for it, and the two things that can be done with it: save it, or delete the
 * one that is saved. It is the one place a key is typed.
 *
 * A key that is empty or only spaces, and a saved key OpenRouter refused, are
 * each one danger line under the field. Money and an outside account are at
 * stake, which is what the sentence above the field is for.
 */
@Component({
  selector: 'mn-openrouter-key-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, DialogComponent, SecretFieldComponent],
  template: `
    <form (submit)="save($event)">
      <mn-dialog heading="OpenRouter key" headingId="mn-key-dialog-title">
        <p class="mn-hint">
          OpenRouter is the one service Monosai sends text to. It bills your account per request;
          the key stays on this device.
          <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer"
            >Get a key on openrouter.ai</a
          >
        </p>

        <mn-secret-field
          #secret
          label="API key"
          placeholder="sk-or-…"
          testId="api-key-input"
          [hint]="
            credential.isConfigured() ? 'A key is saved. Paste a new one to replace it.' : null
          "
          [error]="problem()"
          [value]="entry()"
          (valueChange)="onInput($event)"
        />

        @if (credential.isConfigured()) {
          <button
            mn-dialog-action="start"
            type="button"
            mnButton="danger"
            data-testid="delete-key"
            (click)="frame().close('delete')"
          >
            Delete key
          </button>
        }
        <button
          mn-dialog-action
          type="submit"
          mnButton="primary"
          data-testid="save-key"
          [attr.aria-busy]="credential.action() === 'saving' ? 'true' : null"
        >
          {{ credential.isConfigured() ? 'Save key' : 'Connect' }}
        </button>
      </mn-dialog>
    </form>
  `,
})
export class OpenRouterKeyDialogComponent {
  protected readonly frame = viewChild.required(DialogComponent);
  private readonly secret = viewChild.required('secret', { read: ElementRef });
  protected readonly credential = inject(CredentialStore);
  private readonly data = inject<OpenRouterKeyDialogData>(DIALOG_DATA);

  protected readonly entry = signal('');
  /** Set when Save was pressed with nothing to save; cleared by typing. */
  private readonly blank = signal(false);

  protected readonly problem = computed(() => {
    if (this.blank()) {
      return 'Enter your OpenRouter key.';
    }
    return this.data.refused() && this.entry() === ''
      ? 'OpenRouter refused the saved key. Paste a new one to replace it.'
      : null;
  });

  constructor() {
    afterNextRender(() => {
      (this.secret().nativeElement as HTMLElement).querySelector('input')?.focus();
    });
  }

  protected onInput(value: string): void {
    this.entry.set(value);
    this.blank.set(false);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.credential.action() !== 'idle') {
      return;
    }
    if (this.entry().trim() === '') {
      this.blank.set(true);
      return;
    }
    const saved = await this.credential.save(this.entry());
    this.entry.set('');
    if (saved) {
      this.frame().close('saved');
    }
  }
}

/** Opens the key dialog and resolves to how it ended, or undefined when it was put away. */
export function openOpenRouterKeyDialog(
  dialog: Dialog,
  data: OpenRouterKeyDialogData,
): Promise<OpenRouterKeyOutcome | undefined> {
  const ref = openDialog<
    OpenRouterKeyOutcome,
    OpenRouterKeyDialogData,
    OpenRouterKeyDialogComponent
  >(dialog, OpenRouterKeyDialogComponent, { data, modal: true, labelledBy: 'mn-key-dialog-title' });
  return dialogResult(ref);
}
