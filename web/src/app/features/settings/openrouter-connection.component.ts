import { Dialog } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { FieldComponent } from '../../shared-ui/field/field.component';
import { SheetPopoverComponent } from '../../shared-ui/popover/sheet-popover.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import type { AiStatus } from './ai-status';

/** The OpenRouter key: where it stands, and connecting, replacing, or deleting it. */
@Component({
  selector: 'mn-openrouter-connection',
  host: { class: 'mn-settings-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, FieldComponent, SettingsRowComponent, SheetPopoverComponent],
  template: `
    <mn-settings-row
      label="OpenRouter key"
      end="nav"
      opens="dialog"
      testId="connect-openrouter"
      [controls]="connection.id()"
      [expanded]="connection.isOpen()"
      [status]="connectionStatus().tone"
      [statusText]="connectionStatus().tone === null ? '' : connectionStatus().text"
      [summary]="connectionStatus().tone === null ? connectionStatus().text : null"
    />
    <mn-sheet-popover
      #connection="mnSheetPopover"
      heading="OpenRouter key"
      placement="centred"
      role="dialog"
      closeLabel="Close"
      [modal]="true"
      (dismissed)="connection.hide()"
    >
      @if (connection.isOpen()) {
        <!--
          What OpenRouter is and where a key comes from, on the one screen
          a first-run blocker sends people to. Money and an external
          account are at stake, which is what standing prose is for.
        -->
        <p class="mn-hint">
          OpenRouter is the one service Monosai sends text to. It bills your account per request;
          Monosai stores the key on this device only.
        </p>
        <a
          class="mn-hint"
          href="https://openrouter.ai/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          >Get a key on openrouter.ai</a
        >
        <mn-field [label]="credential.isConfigured() ? 'Replace API key' : 'API key'">
          <input
            class="mn-control"
            type="password"
            autocomplete="off"
            spellcheck="false"
            data-overlay-focus
            data-testid="api-key-input"
            placeholder="sk-or-…"
            [value]="keyDraft()"
            (input)="onKeyInput($event)"
          />
        </mn-field>
      }
      @if (credential.isConfigured()) {
        <button mn-dialog-action="start" type="button" mnButton="danger" (click)="removeKey()">
          Delete key
        </button>
      }
      <button
        mn-dialog-action
        type="button"
        mnButton="primary"
        data-testid="save-key"
        [disabled]="keyDraft().trim() === '' || credential.action() !== 'idle'"
        (click)="saveKey()"
      >
        {{ credential.isConfigured() ? 'Replace key' : 'Connect' }}
      </button>
    </mn-sheet-popover>
  `,
})
export class OpenRouterConnectionComponent {
  private readonly dialog = inject(Dialog);
  private readonly text = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  protected readonly credential = inject(CredentialStore);
  protected readonly keyDraft = signal('');
  /** Where the key stands: refused, working, or only saved. */
  protected readonly connectionStatus = computed<AiStatus>(() => {
    if (!this.credential.isConfigured()) return { tone: null, text: 'Not connected' };
    if (
      this.text.testFailure()?.code === 'authentication' ||
      this.tts.testFailure()?.code === 'authentication'
    ) {
      return { tone: 'danger', text: 'Key refused' };
    }
    return this.text.readiness() === 'ready' || this.tts.readiness() === 'ready'
      ? { tone: 'success', text: 'Connected' }
      : { tone: null, text: 'Key saved' };
  });
  private readonly connectionPanel = viewChild.required<SheetPopoverComponent>('connection');

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }
  protected async saveKey(): Promise<void> {
    const saved = await this.credential.save(this.keyDraft());
    this.keyDraft.set('');
    if (saved) {
      this.connectionPanel().hide();
    }
  }
  protected async removeKey(): Promise<void> {
    // The confirmation is a dialog, and a panel left open would sit under it.
    this.connectionPanel().hide();
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete OpenRouter key?',
      message: 'AI requests will stop until you connect again.',
      details: ['Your model choices and saved content stay on this device.'],
      confirmLabel: 'Delete key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (confirmed) {
      await this.credential.remove();
      this.connectionPanel().hide();
    }
  }
}
