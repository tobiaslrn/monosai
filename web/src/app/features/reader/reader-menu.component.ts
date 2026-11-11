import {
  ChangeDetectionStrategy,
  Component,
  computed,
  afterNextRender,
  effect,
  ElementRef,
  Injector,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ReaderAidsComponent } from './reader-aids.component';
import type { ReaderContentState } from './reader-content-state';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { DialogGroupComponent } from '../../shared-ui/dialog-group/dialog-group.component';
import { StackComponent } from '../../shared-ui/layout/layout';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { StatusLineComponent } from '../../shared-ui/status-line/status-line.component';
import {
  OverlayTriggerDirective,
  SheetPopoverComponent,
} from '../../shared-ui/popover/sheet-popover.component';

/** One reader options surface: appearance, saved content, and maintenance. */
@Component({
  selector: 'mn-reader-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DialogGroupComponent,
    IconComponent,
    OverlayTriggerDirective,
    ReaderAidsComponent,
    SettingsRowComponent,
    SheetPopoverComponent,
    StackComponent,
    StatusLineComponent,
  ],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    <button
      #anchor
      type="button"
      class="mn-icon-button"
      aria-label="Story options"
      title="Story options"
      aria-haspopup="dialog"
      [mnOverlayTrigger]="panel"
    >
      <mn-icon name="overflow" />
    </button>
    <mn-sheet-popover
      #panel
      id="mn-reader-menu-panel"
      role="dialog"
      heading="Story options"
      closeLabel="Close story options"
      (opened)="onToggle()"
      (closed)="onToggle()"
      (dismissed)="close()"
    >
      <mn-stack [gap]="5">
        <mn-reader-aids />
        <mn-dialog-group heading="Content for this story">
          @for (row of rows(); track row.layer) {
            <div
              class="mn-settings-cluster"
              role="group"
              tabindex="-1"
              [attr.aria-label]="row.name"
              [attr.data-layer]="row.layer"
            >
              <mn-settings-row
                [live]="true"
                [label]="row.name"
                [summary]="sharedSetup() !== null && row.setup ? 'Not set up' : row.status"
              />
              @switch (row.action) {
                @case ('settings') {
                  @if (sharedSetup() === null || !row.setup) {
                    <mn-settings-row
                      end="nav"
                      [label]="row.label"
                      [link]="row.settingsLink"
                      (pressed)="close()"
                    />
                  }
                }
                @case ('credit') {
                  <mn-settings-row
                    action="accent"
                    glyph="external"
                    [label]="row.label"
                    href="https://openrouter.ai/settings/credits"
                    (pressed)="followCredit(row.layer)"
                  />
                }
                @case ('prepare') {
                  <mn-settings-row
                    action="accent"
                    [label]="row.label"
                    [disabled]="row.disabled"
                    [busy]="pending() === row.layer"
                    (pressed)="pending() === row.layer || prepare.emit(row.layer)"
                  />
                }
                @case ('cancel') {
                  <mn-settings-row
                    action="accent"
                    [label]="row.label"
                    [busy]="pending() === row.layer"
                    (pressed)="pending() === row.layer || stopRequested.emit(row.layer)"
                  />
                }
              }
              @if (hasSavedLayer(row.layer)) {
                <mn-settings-row
                  action="danger"
                  [label]="clearLabel(row.layer)"
                  (pressed)="clearLayer(row.layer)"
                />
              }
            </div>
          }
          <!--
            One missing setup step blocks several layers at once — typically no
            OpenRouter key. It is said once, with its one way forward, instead of
            as the same sentence and the same link on every row.
          -->
          @if (sharedSetup(); as setup) {
            <mn-status-line tone="setup" data-testid="shared-setup">
              {{ setup.status }}
              <a mn-status-line-action [routerLink]="setup.link" (click)="close()">{{
                setup.label
              }}</a>
            </mn-status-line>
          }
          @for (row of rows(); track row.layer) {
            @if (row.error) {
              <mn-status-line tone="danger">{{ row.error }}</mn-status-line>
            }
          }
          @if (error()) {
            <mn-status-line tone="danger">{{ error() }}</mn-status-line>
          }
        </mn-dialog-group>
      </mn-stack>
    </mn-sheet-popover>
  `,
})
export class ReaderMenuComponent {
  readonly rows = input.required<readonly ReaderContentState[]>();
  readonly hasAudio = input(false);
  readonly savedLayers = input<readonly PreparationLayer[]>([]);
  readonly pending = input<PreparationLayer | null>(null);
  readonly error = input<string | null>(null);
  readonly prepare = output<PreparationLayer>();
  readonly opened = output<void>();
  /** Whether the panel is showing, so what it reported can be told from what it never showed. */
  readonly shown = output<boolean>();
  /** The credit link was followed: the learner is leaving to add credit. */
  readonly creditOpened = output<'english' | 'grammar'>();
  readonly stopRequested = output<PreparationLayer>();
  readonly deleteAudioRequested = output<void>();
  readonly clearAidRequested = output<'english' | 'grammar'>();
  private readonly anchor = viewChild.required<ElementRef<HTMLButtonElement>>('anchor');
  private readonly panel = viewChild.required(SheetPopoverComponent);
  private readonly injector = inject(Injector);
  protected readonly menuOpen = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The row whose credit link holds focus, which the link's removal would drop. */
  private creditFocus: PreparationLayer | null = null;

  constructor() {
    // Returning from the credit page removes the link that was focused, and
    // focus would fall to the page behind a panel that traps it. It goes to
    // the row's new action, or to the row itself.
    effect(() => {
      const rows = this.rows();
      const layer = this.creditFocus;
      if (layer === null) return;
      if (rows.find((row) => row.layer === layer)?.action === 'credit') return;
      this.creditFocus = null;
      afterNextRender(
        () => {
          const root = this.host.nativeElement;
          const active = root.ownerDocument.activeElement;
          if (active !== null && active !== root.ownerDocument.body) return;
          const row = root.querySelector<HTMLElement>(`[data-layer="${layer}"]`);
          (row?.querySelector<HTMLElement>('.mn-settings-press') ?? row)?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  /**
   * The setup step two or more rows are waiting on, when they all wait on the
   * same one. Its label is the text layers' way to Settings, since audio's
   * own voice setup lives on the player.
   */
  protected readonly sharedSetup = computed(() => {
    const waiting = this.rows().filter((row) => row.setup);
    const [first] = waiting;
    if (
      first === undefined ||
      waiting.length < 2 ||
      waiting.some((row) => row.status !== first.status)
    ) {
      return null;
    }
    const text = waiting.find((row) => row.layer !== 'audio') ?? first;
    return { status: first.status, label: text.label, link: text.settingsLink };
  });

  open(): void {
    this.panel().show();
  }
  close(): void {
    this.panel().hide();
    this.anchor().nativeElement.focus();
  }
  protected followCredit(layer: PreparationLayer): void {
    if (layer === 'audio') return;
    this.creditFocus = layer;
    this.creditOpened.emit(layer);
  }
  protected onToggle(): void {
    const open = this.panel().isOpen();
    this.menuOpen.set(open);
    this.shown.emit(open);
    if (open) {
      this.opened.emit();
    }
  }
  protected onEscape(event: Event): void {
    if (this.menuOpen()) {
      event.preventDefault();
      this.close();
    }
  }
  protected deleteAudio(): void {
    this.close();
    this.deleteAudioRequested.emit();
  }
  protected hasSavedLayer(layer: PreparationLayer): boolean {
    return layer === 'audio' ? this.hasAudio() : this.savedLayers().includes(layer);
  }
  /** The whole sentence, which is what the icon-only control is named. */
  protected clearLabel(layer: PreparationLayer): string {
    switch (layer) {
      case 'english':
        return 'Clear translation…';
      case 'grammar':
        return 'Clear grammar notes…';
      case 'audio':
        return 'Delete audio…';
    }
  }
  protected clearLayer(layer: PreparationLayer): void {
    if (layer === 'audio') {
      this.deleteAudio();
      return;
    }
    this.close();
    this.clearAidRequested.emit(layer);
  }
}
