import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { ANKI_PROVIDER_FACTORY } from '../../application/shared/anki-tokens';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import type { AnkiProviderKind } from '../../domain/vocabulary/snapshot';
import { isValidAnkiConnectPort } from '../../domain/settings/settings';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { TextListSourceComponent } from './text-list-source.component';

type AddMode = 'closed' | 'choices' | 'anki' | 'text';

/** One entry point for every kind of vocabulary source. */
@Component({
  selector: 'mn-provider-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-editor]': "mode() === 'text'",
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenuOnEscape($event)',
  },
  imports: [IconComponent, TextListSourceComponent],
  template: `
    <div class="add-source">
      @if (mode() !== 'text') {
        <button
          #toggle
          type="button"
          class="mn-button mn-button--primary"
          aria-haspopup="dialog"
          aria-controls="mn-add-source-menu"
          [attr.aria-expanded]="mode() === 'choices' || mode() === 'anki'"
          popovertarget="mn-add-source-menu"
          data-testid="add-source"
        >
          <mn-icon name="add" /> Add source
        </button>

        <div
          #menu
          id="mn-add-source-menu"
          class="menu"
          popover
          role="dialog"
          aria-label="Add vocabulary source"
          (toggle)="onMenuToggle($event)"
        >
          @if (mode() === 'anki') {
            <div class="connection-panel">
              <div class="connection-head">
                <div>
                  <h3>Connect to Anki</h3>
                  <p class="mn-hint">Keep Anki open while Monosai connects.</p>
                </div>
              </div>

              <div class="mn-field">
                <label for="mn-source-anki-port">Port</label>
                <input
                  id="mn-source-anki-port"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="65535"
                  step="1"
                  required
                  [value]="ankiPortDraft()"
                  [attr.aria-invalid]="ankiPortValid() ? null : 'true'"
                  aria-describedby="mn-source-anki-port-hint"
                  (input)="setAnkiPortDraft($event)"
                  data-testid="anki-connect-port"
                />
                <span id="mn-source-anki-port-hint" class="mn-hint">
                  Usually 8765. Use the port from your AnkiConnect configuration.
                </span>
              </div>

              <div class="connection-actions">
                <button type="button" class="mn-button" (click)="mode.set('choices')">Back</button>
                <button
                  type="button"
                  class="mn-button mn-button--primary"
                  [disabled]="refresh.isBusy() || !ankiPortValid()"
                  (click)="connectAnkiConnect()"
                  data-testid="connect-ankiconnect"
                >
                  Connect
                </button>
              </div>
            </div>
          } @else {
            <button
              type="button"
              class="menu-item"
              [disabled]="refresh.isBusy()"
              (click)="chooseAnkiConnect()"
              data-testid="choose-ankiconnect"
            >
              <strong>Anki</strong>
              <span class="mn-hint">Connect to the desktop app</span>
            </button>
            <button
              type="button"
              class="menu-item"
              [disabled]="refresh.isBusy() || packageBusy()"
              (click)="packageInput.click()"
            >
              <strong>Anki package</strong>
            </button>
            <button
              type="button"
              class="menu-item"
              (click)="chooseTextList()"
              data-testid="add-text-source"
            >
              <strong>Pasted list</strong>
            </button>
          }
        </div>
        <input
          #packageInput
          class="file-input"
          type="file"
          aria-label="Choose Anki package"
          aria-hidden="true"
          tabindex="-1"
          accept=".apkg,.colpkg"
          [disabled]="refresh.isBusy() || packageBusy()"
          (change)="choosePackage($event)"
          data-testid="package-input"
        />
      } @else {
        <div class="editor-head">
          <h3>Add pasted list</h3>
        </div>
        <mn-text-list-source (saved)="close()" (cancelled)="mode.set('choices')" />
      }
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    :host.is-editor {
      flex-basis: 100%;
      width: 100%;
    }

    .add-source {
      display: grid;
      justify-items: end;
      gap: var(--space-2);
    }

    [data-testid='add-source'] {
      anchor-name: --mn-add-source-anchor;
    }

    .editor-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      width: 100%;
    }

    .editor-head h3 {
      margin: 0;
    }

    .menu {
      position: absolute;
      position-anchor: --mn-add-source-anchor;
      position-area: bottom span-left;
      z-index: 10;
      inset: auto;
      display: grid;
      width: min(20rem, calc(100vw - var(--space-4)));
      margin: var(--space-1) 0 0;
      padding: var(--space-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 12%);
    }

    .menu:not(:popover-open) {
      display: none;
    }

    .menu-item {
      position: relative;
      display: grid;
      gap: 0.15rem;
      min-height: var(--touch-target);
      padding: var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
    }

    .connection-panel {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-3);
    }

    .connection-head h3,
    .connection-head p {
      margin: 0;
    }

    .connection-head {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .connection-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    .menu-item:hover {
      background: var(--surface-raised);
    }

    .menu-item:focus-within,
    .menu-item:focus-visible {
      outline: var(--focus-ring);
    }

    .file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    mn-text-list-source {
      width: 100%;
    }
  `,
})
export class ProviderSelectionComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  private readonly mappings = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  private readonly packageImport = inject(PackageImportStore);

  protected readonly packageBusy = this.packageImport.isActive;
  protected readonly mode = signal<AddMode>('closed');
  protected readonly ankiPortDraft = signal(String(this.settings.ankiConnectPort()));
  protected readonly ankiPortValid = computed(() => {
    const draft = this.ankiPortDraft().trim();
    return draft !== '' && isValidAnkiConnectPort(Number(draft));
  });
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  protected close(): void {
    this.mode.set('closed');
  }

  protected onMenuToggle(event: Event): void {
    if (this.mode() === 'text') {
      return;
    }
    this.mode.set(
      (event.currentTarget as HTMLElement).matches(':popover-open') ? 'choices' : 'closed',
    );
  }

  protected chooseTextList(): void {
    this.hideMenu();
    this.mode.set('text');
  }

  protected closeMenuOnEscape(event: Event): void {
    const menu = this.menu()?.nativeElement;
    if (menu === undefined) {
      return;
    }
    if (!menu.matches(':popover-open')) {
      return;
    }
    event.preventDefault();
    this.hideMenu();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const menu = this.menu()?.nativeElement;
    const toggle = this.toggleButton()?.nativeElement;
    if (menu === undefined || toggle === undefined) {
      return;
    }
    if (!menu.matches(':popover-open') || !(event.target instanceof Node)) {
      return;
    }
    if (menu.contains(event.target) || toggle.contains(event.target)) {
      return;
    }
    this.hideMenu();
  }

  protected async connectAnkiConnect(): Promise<void> {
    const port = Number(this.ankiPortDraft());
    if (!isValidAnkiConnectPort(port)) {
      return;
    }
    await this.settings.setAnkiConnectPort(port);
    this.hideMenu();
    await this.connectAndAdd('desktop-connect', this.createConnection('desktop-connect'));
  }

  protected chooseAnkiConnect(): void {
    this.mode.set('anki');
  }

  protected setAnkiPortDraft(event: Event): void {
    this.ankiPortDraft.set((event.target as HTMLInputElement).value);
  }

  /**
   * Hands a chosen file to the package import.
   *
   * Choosing a file and receiving one shared from Android run the same use
   * case, so re-importing a deck replaces its source either way instead of
   * adding a second one.
   */
  protected async choosePackage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file === null || file === undefined) {
      return;
    }
    // Cleared so choosing the same file twice in a row still raises `change`.
    input.value = '';
    this.hideMenu();
    this.close();
    await this.packageImport.start({ fileName: file.name, bytes: () => file.arrayBuffer() });
  }

  private hideMenu(): void {
    const menu = this.menu()?.nativeElement;
    if (menu === undefined) {
      return;
    }
    if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
      menu.hidePopover();
    }
  }

  private async connectAndAdd(
    providerKind: AnkiProviderKind,
    provider: Parameters<VocabularyRefreshStore['connect']>[0],
  ): Promise<void> {
    await this.refresh.connect(provider);
    const catalog = this.refresh.catalog();
    const deck =
      catalog?.decks.find((candidate) => candidate.name !== 'Default')?.name ??
      catalog?.decks.at(0)?.name;
    const noteType = catalog?.noteTypes.at(0);
    const expressionFieldName = noteType?.fieldNames.at(0);
    if (deck === undefined || noteType === undefined || expressionFieldName === undefined) {
      return;
    }
    const source = await this.mappings.add({
      providerKind,
      deckName: deck,
      deckScope: 'deck-only',
      noteTypeName: noteType.name,
      expressionFieldName,
    });
    if (source === null) {
      return;
    }
    await this.refresh.refreshAndCommit();
    await this.history.load();
    this.close();
  }
}
