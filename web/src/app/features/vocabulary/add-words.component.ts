import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { ANKI_PROVIDER_FACTORY } from '../../application/shared/anki-tokens';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { isValidAnkiConnectPort } from '../../domain/settings/settings';
import { HOST_PLATFORM } from '../../domain/platform/host-platform';
import { technicalCode } from '../../domain/shared/errors';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { FieldComponent } from '../../shared-ui/field/field.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ClusterComponent, StackComponent } from '../../shared-ui/layout/layout';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { RowComponent } from '../../shared-ui/row/row.component';
import {
  OverlayTriggerDirective,
  SheetPopoverComponent,
} from '../../shared-ui/popover/sheet-popover.component';
import { ANKI_LINKS } from './anki-links';
import { connectFailureCopy, NOTHING_SAVED } from './anki-error-copy';

/** What the sheet is showing. Anki has no panel of its own: pressing it just tries. */
type AddMode = 'closed' | 'choices' | 'anki';

/**
 * The one way words get in.
 *
 * Three rows, one line each, and the line under Anki names the software that
 * has to be installed for the row to work at all — which differs per platform,
 * so the platform decides the words and the adapter rather than the learner
 * choosing between two Anki entries that were never alternatives.
 *
 * It is a task dialog: centred over a dimmed page on a wide screen and docked
 * to the bottom edge on a phone. It is a native popover rather than a CDK
 * dialog because it must stay open while a file chooser is up.
 */
@Component({
  selector: 'mn-add-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenuOnEscape($event)',
  },
  imports: [
    ButtonDirective,
    ClusterComponent,
    DisclosureComponent,
    FieldComponent,
    IconComponent,
    NoticeComponent,
    OverlayTriggerDirective,
    RowComponent,
    SheetPopoverComponent,
    StackComponent,
  ],
  template: `
    <mn-cluster justify="end">
      <button
        #toggle
        type="button"
        mnButton="ghost"
        aria-haspopup="dialog"
        data-testid="add-words"
        [mnOverlayTrigger]="menu"
      >
        <mn-icon name="add" [size]="18" /> Add source
      </button>
    </mn-cluster>

    <mn-sheet-popover
      #menu="mnSheetPopover"
      id="mn-add-words-menu"
      role="dialog"
      placement="centred"
      label="Add words"
      [heading]="mode() === 'anki' ? 'Anki' : 'Add words'"
      [backLabel]="mode() === 'anki' ? 'Back to the list of sources' : null"
      [modal]="true"
      (toggle)="onMenuToggle($event)"
      (back)="mode.set('choices')"
      (dismissed)="dismiss()"
    >
      @if (mode() === 'anki') {
        @if (failure(); as copy) {
          <mn-stack [gap]="2" role="alert" data-testid="anki-connect-failed">
            <p>
              <strong>{{ copy.headline }}</strong>
            </p>
            @for (paragraph of copy.paragraphs; track $index) {
              <p class="mn-hint">
                {{ paragraph.before }}
                @if (paragraph.link; as link) {
                  <a [href]="link.href" target="_blank" rel="noopener noreferrer">{{ link.text }}</a
                  >{{ paragraph.after }}
                }
              </p>
            }
            <p class="mn-hint">{{ unchanged }}</p>
            <mn-disclosure heading="Advanced details" tone="quiet" [flush]="true">
              @if (copy.offersPort) {
                <mn-field
                  label="Port"
                  errorId="mn-anki-port-error"
                  [error]="portValid() ? null : 'Enter a port from 1 to 65535.'"
                >
                  <input
                    class="mn-control"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="65535"
                    step="1"
                    required
                    [value]="portDraft()"
                    [attr.aria-invalid]="portValid() ? null : 'true'"
                    [attr.aria-describedby]="portValid() ? null : 'mn-anki-port-error'"
                    (input)="setPortDraft($event)"
                    data-testid="anki-connect-port"
                  />
                </mn-field>
              }
              @if (failureDetail(); as detail) {
                <p class="mn-hint">{{ detail }}</p>
              }
              <p class="mn-hint">
                {{ failureCode() }} ·
                <a [href]="links.troubleshooting" target="_blank" rel="noopener noreferrer"
                  >troubleshooting</a
                >
              </p>
            </mn-disclosure>
          </mn-stack>
        } @else {
          <p role="status">{{ connectingLabel() }}</p>
        }
      } @else {
        <div class="mn-overlay__rows">
          @if (platform === 'ios') {
            <mn-row
              icon="anki-source"
              heading="Connect to Anki"
              testId="choose-anki"
              [action]="true"
              [disabled]="true"
            >
              <span mn-row-meta>iOS cannot be read directly — export a file instead</span>
            </mn-row>
          } @else {
            <mn-row
              icon="anki-source"
              heading="Connect to Anki"
              testId="choose-anki"
              [action]="true"
              [disabled]="refresh.isBusy()"
              (pressed)="chooseAnki()"
            >
              <span mn-row-meta>{{ ankiSubtitle }}</span>
              <mn-icon name="chevron-right" />
            </mn-row>
          }
          <mn-row
            icon="file"
            heading="Import from Anki"
            testId="choose-package"
            [action]="true"
            [disabled]="refresh.isBusy() || packageBusy()"
            (pressed)="packageInput.click()"
          >
            <span mn-row-meta>{{ fileSubtitle }}</span>
            <mn-icon name="chevron-right" />
          </mn-row>
          <mn-row
            icon="word-list"
            heading="Add a word list"
            testId="add-text-source"
            [action]="true"
            (pressed)="chooseTextList()"
          >
            <span mn-row-meta>One word per line</span>
            <mn-icon name="chevron-right" />
          </mn-row>
        </div>
        @if (platform === 'ios') {
          <p class="mn-hint">
            <a [href]="links.ankiExporting" target="_blank" rel="noopener noreferrer"
              >How to export from Anki</a
            >
          </p>
        }
        <mn-notice icon="info"
          >Your sources stay separate. Duplicate words are counted once.</mn-notice
        >
      }
      @if (mode() === 'anki' && failure() !== null) {
        <button
          mn-dialog-action
          type="button"
          mnButton="primary"
          [disabled]="refresh.isBusy() || !portValid()"
          (click)="connectAnki()"
          data-testid="anki-retry"
        >
          Try again
        </button>
      }
    </mn-sheet-popover>
    <input
      #packageInput
      class="mn-visually-hidden"
      type="file"
      aria-label="Choose Anki package"
      aria-hidden="true"
      tabindex="-1"
      accept=".apkg,.colpkg"
      [disabled]="refresh.isBusy() || packageBusy()"
      (change)="choosePackage($event)"
      data-testid="package-input"
    />
  `,
})
export class AddWordsComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  private readonly connection = inject(AnkiConnectionStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly createConnection = inject(ANKI_PROVIDER_FACTORY);
  private readonly packageImport = inject(PackageImportStore);
  protected readonly platform = inject(HOST_PLATFORM);
  protected readonly links = ANKI_LINKS;
  protected readonly unchanged = NOTHING_SAVED;

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

  /**
   * The failure's own cause, which the code alone does not carry.
   *
   * Which origin was refused, which action was missing, which bridge build
   * answered: the kind of detail that decides a bug report and is noise on the
   * surface, so it sits under the same disclosure as the code.
   */
  protected readonly failureDetail = computed(() => {
    const state = this.refresh.state();
    return state.kind === 'failed' ? (state.error.cause ?? '') : '';
  });

  protected readonly connectingLabel = computed(() =>
    this.platform === 'android' ? 'Asking the bridge…' : 'Asking Anki…',
  );

  /**
   * Asked for by the learner, answered by the page.
   *
   * A pasted list is drafted in the section itself rather than in this control:
   * an editor rendered here would be a section action, and grew the heading row
   * around it instead of standing on the page as the card it is.
   */
  readonly textListChosen = output<void>();

  private readonly menu = viewChild<SheetPopoverComponent>('menu');
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  protected close(): void {
    this.mode.set('closed');
  }

  /** For a page that took over from the menu and is done: the control that asked comes back. */
  focusToggle(): void {
    this.toggleButton()?.nativeElement.focus();
  }

  /** Put away unanswered: nothing was chosen, so focus goes back to the control that opened it. */
  protected dismiss(): void {
    this.hideMenu();
    this.toggleButton()?.nativeElement.focus();
  }

  protected onMenuToggle(event: Event): void {
    const open = (event.currentTarget as HTMLElement).matches(':popover-open');
    // Re-opening always starts at the three rows: a failure the learner walked
    // away from is not the thing they came back for.
    this.mode.set(open ? 'choices' : 'closed');
  }

  protected chooseTextList(): void {
    this.hideMenu();
    this.close();
    this.textListChosen.emit();
  }

  protected closeMenuOnEscape(event: Event): void {
    if (this.menu()?.isOpen() !== true) {
      return;
    }
    event.preventDefault();
    this.dismiss();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const menu = this.menu()?.element();
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
    this.menu()?.hide();
  }
}
