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
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopupDirective, PopupTriggerDirective } from '../../shared-ui/popup/popup.directive';
import { ModelCatalogView } from './model-catalog-view';

/** The OpenRouter key: where it stands, and connecting, replacing, or deleting it. */
@Component({
  selector: 'mn-openrouter-connection',
  host: { class: 'connection' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PopupDirective, PopupTriggerDirective],
  template: `
    <button
      type="button"
      class="mn-settings-row mn-settings-row--interactive"
      data-testid="connect-openrouter"
      aria-haspopup="dialog"
      [mnPopupTrigger]="connection"
    >
      <span class="mn-settings-row__label">
        <span class="mn-settings-row__title">OpenRouter key</span>
      </span>
      <span class="mn-settings-row__end">
        <span
          class="mn-status-pill"
          [class.mn-status-pill--success]="connectionLabel() === 'Connected'"
          [class.mn-status-pill--danger]="connectionLabel() === 'Needs attention'"
          >{{ connectionLabel() }}</span
        >
        <mn-icon class="mn-settings-chevron" name="chevron-right" [size]="18" />
      </span>
    </button>
    <div
      mnPopup
      #connection="mnPopup"
      class="mn-popup--start connection-menu"
      role="dialog"
      aria-label="OpenRouter connection"
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
        <label class="mn-field">
          <span>{{ credential.isConfigured() ? 'Replace API key' : 'API key' }}</span>
          <input
            class="mn-control"
            type="password"
            autocomplete="off"
            spellcheck="false"
            data-testid="api-key-input"
            placeholder="sk-or-…"
            [value]="keyDraft()"
            (input)="onKeyInput($event)"
          />
        </label>
        <div class="connection-actions mn-actions">
          <button
            type="button"
            class="mn-button mn-button--primary"
            data-testid="save-key"
            [disabled]="keyDraft().trim() === '' || credential.action() !== 'idle'"
            (click)="saveKey()"
          >
            {{ credential.isConfigured() ? 'Replace key' : 'Connect' }}
          </button>
          @if (credential.isConfigured()) {
            <button type="button" class="mn-button mn-button--danger" (click)="removeKey()">
              Delete key
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    p {
      margin: 0;
    }
    .connection-menu:popover-open {
      display: grid;
      gap: var(--space-3);
      width: min(23rem, calc(100vw - 4 * var(--space-4)));
      margin-inline-start: var(--space-4);
      padding: var(--space-3);
    }
    .connection-actions {
      justify-content: flex-end;
    }
  `,
})
export class OpenRouterConnectionComponent {
  private readonly dialog = inject(Dialog);
  private readonly catalog = inject(ModelCatalogView);
  private readonly text = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  protected readonly credential = inject(CredentialStore);
  protected readonly keyDraft = signal('');
  protected readonly connectionLabel = computed(() => {
    if (!this.credential.isConfigured()) return 'Not connected';
    if (this.text.readiness() === 'failed' || this.tts.readiness() === 'failed')
      return 'Needs attention';
    return this.text.readiness() === 'ready' || this.tts.readiness() === 'ready'
      ? 'Connected'
      : 'Key saved';
  });
  private readonly connectionPanel = viewChild.required<PopupDirective>('connection');

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }
  protected async saveKey(): Promise<void> {
    const saved = await this.credential.save(this.keyDraft());
    this.keyDraft.set('');
    if (saved) {
      this.connectionPanel().hide();
      this.catalog.reload();
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
