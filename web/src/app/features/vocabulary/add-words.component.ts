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
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { AnkiMappingDraftComponent } from './anki-mapping-draft.component';
import { isValidAnkiConnectPort } from '../../domain/settings/settings';
import { HOST_PLATFORM } from '../../domain/platform/host-platform';
import { technicalCode } from '../../domain/shared/errors';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { TextListSourceComponent } from './text-list-source.component';
import { ANKI_LINKS } from './anki-links';
import { connectFailureCopy } from './anki-error-copy';

/** What the sheet is showing. Anki has no panel of its own: pressing it just tries. */
type AddMode = 'closed' | 'choices' | 'anki' | 'text';

/**
 * The one way words get in.
 *
 * Three rows, one line each, and the line under Anki names the software that
 * has to be installed for the row to work at all — which differs per platform,
 * so the platform decides the words and the adapter rather than the learner
 * choosing between two Anki entries that were never alternatives.
 *
 * The sheet hangs from its control on a wide screen and docks to the bottom
 * edge on a phone, where it is a temporary surface over a dimmed page.
 */
@Component({
  selector: 'mn-add-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-editor]': "mode() === 'text' || connection.selecting() || connection.sampling()",
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenuOnEscape($event)',
  },
  providers: [AnkiConnectionStore],
  imports: [IconComponent, TextListSourceComponent, AnkiMappingDraftComponent],
  template: `
    <div class="add-words">
      @if (mode() !== 'text') {
        <button
          #toggle
          type="button"
          class="mn-button mn-button--ghost"
          aria-haspopup="dialog"
          aria-controls="mn-add-words-menu"
          [attr.aria-expanded]="mode() === 'choices' || mode() === 'anki'"
          popovertarget="mn-add-words-menu"
          data-testid="add-words"
        >
          <mn-icon name="add" [size]="18" /> Add source
        </button>

        <div
          #menu
          id="mn-add-words-menu"
          class="menu"
          popover
          role="dialog"
          aria-label="Add words"
          (toggle)="onMenuToggle($event)"
        >
          <span class="grip" aria-hidden="true"></span>
          @if (mode() === 'anki') {
            <div class="sheet-head">
              <button
                type="button"
                class="mn-icon-button"
                aria-label="Back to the list of sources"
                (click)="mode.set('choices')"
              >
                <mn-icon name="back" />
              </button>
              <h3>Anki</h3>
            </div>
            @if (failure(); as copy) {
              <div class="sheet-pad" role="alert" data-testid="anki-connect-failed">
                <p class="headline">{{ copy.headline }}</p>
                @for (paragraph of copy.paragraphs; track $index) {
                  <p class="mn-hint">
                    {{ paragraph.before }}
                    @if (paragraph.link; as link) {
                      <a [href]="link.href" target="_blank" rel="noopener noreferrer">{{
                        link.text
                      }}</a>
                    }
                    {{ paragraph.after }}
                  </p>
                }
                <details class="mn-disclosure advanced-details">
                  <summary><span class="summary-label">Advanced details</span></summary>
                  @if (copy.offersPort) {
                    <label class="mn-field port">
                      <span>Port</span>
                      <input
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="65535"
                        step="1"
                        required
                        [value]="portDraft()"
                        [attr.aria-invalid]="portValid() ? null : 'true'"
                        (input)="setPortDraft($event)"
                        data-testid="anki-connect-port"
                      />
                    </label>
                  }
                  <p class="code-line">
                    {{ failureCode() }} ·
                    <a [href]="links.troubleshooting" target="_blank" rel="noopener noreferrer"
                      >troubleshooting</a
                    >
                  </p>
                </details>
              </div>
              <div class="sheet-foot">
                <button
                  type="button"
                  class="mn-button mn-button--primary"
                  [disabled]="refresh.isBusy() || !portValid()"
                  (click)="connectAnki()"
                  data-testid="anki-retry"
                >
                  Try again
                </button>
              </div>
            } @else {
              <div class="sheet-pad">
                <p role="status">{{ connectingLabel() }}</p>
              </div>
            }
          } @else {
            <div class="sheet-intro">
              <h3 class="sheet-title">Add words</h3>
            </div>
            <div class="choices">
              @if (platform === 'ios') {
                <button type="button" class="choice" disabled data-testid="choose-anki">
                  <span class="mn-icon-badge" aria-hidden="true">
                    <mn-icon name="anki-source" [size]="22" />
                  </span>
                  <span class="choice-main">
                    <strong>Connect to Anki</strong>
                    <span class="choice-hint"
                      >iOS cannot be read directly — export a file instead</span
                    >
                  </span>
                </button>
                <p class="mn-hint aside">
                  <a [href]="links.ankiExporting" target="_blank" rel="noopener noreferrer"
                    >How to export from Anki</a
                  >
                </p>
              } @else {
                <button
                  type="button"
                  class="choice"
                  [disabled]="refresh.isBusy()"
                  (click)="chooseAnki()"
                  data-testid="choose-anki"
                >
                  <span class="mn-icon-badge" aria-hidden="true">
                    <mn-icon name="anki-source" [size]="22" />
                  </span>
                  <span class="choice-main">
                    <strong>Connect to Anki</strong>
                    <span class="choice-hint">{{ ankiSubtitle }}</span>
                  </span>
                  <mn-icon class="chevron" name="chevron-right" />
                </button>
              }
              <button
                type="button"
                class="choice"
                [disabled]="refresh.isBusy() || packageBusy()"
                (click)="packageInput.click()"
                data-testid="choose-package"
              >
                <span class="mn-icon-badge" aria-hidden="true">
                  <mn-icon name="file" [size]="22" />
                </span>
                <span class="choice-main">
                  <strong>Import from Anki</strong>
                  <span class="choice-hint">{{ fileSubtitle }}</span>
                </span>
                <mn-icon class="chevron" name="chevron-right" />
              </button>
              <button
                type="button"
                class="choice"
                (click)="chooseTextList()"
                data-testid="add-text-source"
              >
                <span class="mn-icon-badge" aria-hidden="true">
                  <mn-icon name="word-list" [size]="22" />
                </span>
                <span class="choice-main">
                  <strong>Add a word list</strong>
                  <span class="choice-hint">One word per line</span>
                </span>
                <mn-icon class="chevron" name="chevron-right" />
              </button>
            </div>
            <p class="sheet-note">
              <mn-icon name="info" [size]="18" />
              <span>Your sources stay separate. Duplicate words are counted once.</span>
            </p>
            <button type="button" class="mn-button" (click)="dismiss()">Cancel</button>
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
          <h3>Your own list</h3>
        </div>
        <mn-text-list-source (saved)="close()" (cancelled)="mode.set('choices')" />
      }
    </div>
    <mn-anki-mapping-draft />
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    :host {
      position: relative;
      display: block;
    }

    :host.is-editor {
      flex-basis: 100%;
      width: 100%;
    }

    .add-words {
      display: grid;
      justify-items: end;
      gap: var(--space-2);
    }

    .add-words > .mn-button {
      anchor-name: --mn-add-words-anchor;
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
      position-anchor: --mn-add-words-anchor;
      position-area: bottom span-left;
      z-index: 10;
      inset: auto;
      display: grid;
      gap: var(--space-3);
      width: min(24rem, calc(100vw - var(--space-4)));
      margin: var(--space-1) 0 0;
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sheet);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .menu:not(:popover-open) {
      display: none;
    }

    .grip {
      display: none;
    }

    /*
     * On a phone the sheet docks to the bottom edge of the viewport, which is
     * a placement rule and therefore the one honest use of a breakpoint here.
     */
    @media (max-width: breakpoints.$narrow-max) {
      .menu {
        position: fixed;
        position-area: none;
        inset: auto 0 0;
        width: 100%;
        max-height: 88dvh;
        margin: 0;
        overflow-y: auto;
        padding: var(--space-3) var(--space-4)
          calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
        border-width: 1px 0 0;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      }

      .menu::backdrop {
        background: rgb(0 0 0 / 38%);
      }

      .grip {
        display: block;
        justify-self: center;
        width: 2.5rem;
        height: 0.3rem;
        border-radius: var(--radius-pill);
        background: var(--border-strong);
        opacity: 0.6;
      }
    }

    .sheet-intro {
      display: grid;
      gap: var(--space-1);
    }

    .sheet-title {
      margin: 0;
      font-size: var(--text-2xl);
      letter-spacing: -0.01em;
    }

    .sheet-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .sheet-head h3 {
      flex: 1;
      margin: 0;
    }

    .sheet-pad {
      display: grid;
      gap: var(--space-2);
    }

    .sheet-foot {
      display: flex;
      justify-content: flex-end;
    }

    .sheet-pad p {
      margin: 0;
    }

    .headline {
      font-weight: var(--weight-semibold);
    }

    .code-line {
      margin-top: var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .advanced-details {
      border-top: 1px solid var(--border-subtle);
    }

    .aside {
      margin: 0;
      padding: 0 var(--space-2);
    }

    .port {
      max-width: 9rem;
      margin-top: var(--space-2);
    }

    .choices {
      display: grid;
      gap: var(--space-2);
    }

    /* A row, not a menu item: it says what it is and what it needs, then opens. */
    .choice {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      width: 100%;
      min-height: 4.5rem;
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      color: var(--text-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .choice-main {
      display: grid;
      flex: 1;
      gap: 0.15rem;
      min-width: 0;
    }

    .choice-main strong {
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .choice-hint {
      color: var(--action-primary-text);
      font-size: var(--text-sm);
    }

    .choice .chevron {
      flex: none;
      color: var(--text-secondary);
    }

    .choice:hover:not(:disabled) {
      background: var(--surface-sunken);
    }

    .choice:disabled {
      cursor: default;
    }

    .choice:disabled .choice-hint {
      color: var(--text-secondary);
    }

    .sheet-note {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sheet-note mn-icon {
      flex: none;
      margin-top: 0.05rem;
    }

    .sheet-note + .mn-button {
      width: 100%;
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
export class AddWordsComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly connection = inject(AnkiConnectionStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  private readonly packageImport = inject(PackageImportStore);
  protected readonly platform = inject(HOST_PLATFORM);
  protected readonly links = ANKI_LINKS;

  /** The one sentence naming what has to be installed for the Anki row to work. */
  protected readonly ankiSubtitle =
    this.platform === 'android'
      ? 'Through the Monosai bridge app'
      : 'Through the AnkiConnect add-on';

  protected readonly fileSubtitle =
    this.platform === 'android'
      ? 'Choose or share an Anki export file'
      : 'Choose an Anki export file';

  protected readonly packageBusy = this.packageImport.isActive;
  protected readonly mode = signal<AddMode>('closed');
  protected readonly portDraft = signal(String(this.settings.ankiConnectPort()));
  protected readonly portValid = computed(() => {
    const draft = this.portDraft().trim();
    return draft !== '' && isValidAnkiConnectPort(Number(draft));
  });

  protected readonly failure = computed(() => {
    const state = this.refresh.state();
    return state.kind === 'failed'
      ? connectFailureCopy(this.platform, state.error, Number(this.portDraft()))
      : null;
  });

  protected readonly failureCode = computed(() => {
    const state = this.refresh.state();
    return state.kind === 'failed' ? technicalCode(state.error) : '';
  });

  protected readonly connectingLabel = computed(() =>
    this.platform === 'android' ? 'Asking the bridge…' : 'Asking Anki…',
  );

  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  protected close(): void {
    this.mode.set('closed');
  }

  /** Cancel: nothing was chosen, so focus goes back to the control that opened it. */
  protected dismiss(): void {
    this.hideMenu();
    this.toggleButton()?.nativeElement.focus();
  }

  protected onMenuToggle(event: Event): void {
    if (this.mode() === 'text') {
      return;
    }
    const open = (event.currentTarget as HTMLElement).matches(':popover-open');
    // Re-opening always starts at the three rows: a failure the learner walked
    // away from is not the thing they came back for.
    this.mode.set(open ? 'choices' : 'closed');
  }

  protected chooseTextList(): void {
    this.hideMenu();
    this.mode.set('text');
  }

  protected closeMenuOnEscape(event: Event): void {
    const menu = this.menu()?.nativeElement;
    if (menu?.matches(':popover-open') !== true) {
      return;
    }
    event.preventDefault();
    this.dismiss();
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

  /** Pressing Anki just tries; the panel below it is whatever came back. */
  protected async chooseAnki(): Promise<void> {
    this.mode.set('anki');
    await this.connectAnki();
  }

  protected async connectAnki(): Promise<void> {
    const port = Number(this.portDraft());
    if (this.platform === 'desktop') {
      if (!isValidAnkiConnectPort(port)) {
        return;
      }
      await this.settings.setAnkiConnectPort(port);
    }
    await this.connection.connect(
      this.createConnection(this.platform === 'android' ? 'android-connect' : 'desktop-connect'),
    );
    // A catalog means the mapping draft has taken over below the sheet, so the
    // sheet has nothing left to say.
    if (this.refresh.state().kind !== 'failed') {
      this.hideMenu();
      this.close();
    }
  }

  protected setPortDraft(event: Event): void {
    this.portDraft.set((event.target as HTMLInputElement).value);
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
}
