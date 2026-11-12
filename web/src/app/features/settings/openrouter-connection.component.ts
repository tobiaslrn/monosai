import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import type { AiStatus } from './ai-status';
import { openOpenRouterKeyDialog } from './openrouter-key-dialog.component';

/** The OpenRouter key: where it stands, and a row that opens the dialog to connect, replace, or delete it. */
@Component({
  selector: 'mn-openrouter-connection',
  host: { class: 'mn-settings-block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row
      label="OpenRouter key"
      end="nav"
      opens="dialog"
      testId="connect-openrouter"
      [status]="connectionStatus().tone"
      [statusText]="connectionStatus().tone === null ? '' : connectionStatus().text"
      [summary]="connectionStatus().tone === null ? connectionStatus().text : null"
      (pressed)="openKey()"
    />
  `,
})
export class OpenRouterConnectionComponent {
  private readonly dialog = inject(Dialog);
  private readonly text = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  protected readonly credential = inject(CredentialStore);

  /** Whether a test came back saying OpenRouter does not accept the saved key. */
  private readonly refused = computed(
    () =>
      this.credential.isConfigured() &&
      (this.text.testFailure()?.code === 'authentication' ||
        this.tts.testFailure()?.code === 'authentication'),
  );
  /** Where the key stands: refused, working, or only saved. */
  protected readonly connectionStatus = computed<AiStatus>(() => {
    if (!this.credential.isConfigured()) return { tone: null, text: 'Not connected' };
    if (this.refused()) {
      return { tone: 'danger', text: 'Key refused' };
    }
    return this.text.readiness() === 'ready' || this.tts.readiness() === 'ready'
      ? { tone: 'success', text: 'Connected' }
      : { tone: null, text: 'Key saved' };
  });

  protected async openKey(): Promise<void> {
    const outcome = await openOpenRouterKeyDialog(this.dialog, {
      refused: () => this.refused(),
    });
    if (outcome === 'delete') {
      await this.removeKey();
    }
  }

  private async removeKey(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete OpenRouter key?',
      message: 'AI features stop until you add a key.',
      details: ['Your model choices and saved content stay on this device.'],
      confirmLabel: 'Delete key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (confirmed) {
      await this.credential.remove();
    }
  }
}
