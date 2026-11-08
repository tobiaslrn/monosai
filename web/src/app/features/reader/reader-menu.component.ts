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
import { A11yModule } from '@angular/cdk/a11y';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ReaderAidsComponent } from './reader-aids.component';
import type { ReaderContentState } from './reader-content-state';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import { ViewportService } from '../../core/platform/viewport.service';
import { SheetPopoverComponent } from '../../shared-ui/popover/sheet-popover.component';

/** One reader options surface: appearance, saved content, and maintenance. */
@Component({
  selector: 'mn-reader-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, RouterLink, IconComponent, ReaderAidsComponent, SheetPopoverComponent],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    <button
      #anchor
      type="button"
      class="mn-icon-button anchor-button"
      aria-label="Story options"
      title="Story options"
      aria-haspopup="dialog"
      aria-controls="mn-reader-menu-panel"
      [attr.aria-expanded]="menuOpen()"
      popovertarget="mn-reader-menu-panel"
    >
      <mn-icon name="overflow" />
    </button>
    <mn-sheet-popover
      #panel
      id="mn-reader-menu-panel"
      class="panel"
      role="dialog"
      aria-label="Story options"
      anchorName="--mn-options-anchor"
      closeLabel="Close story options"
      [cdkTrapFocus]="menuOpen()"
      (toggle)="onToggle()"
      (closed)="onSheetClosed()"
    >
      <header>
        <h2>Story options</h2>
        @if (!isMobile()) {
          <button
            #closeButton
            type="button"
            class="mn-icon-button"
            aria-label="Close story options"
            title="Close story options"
            (click)="close()"
          >
            <mn-icon name="close" />
          </button>
        }
      </header>
      <mn-reader-aids />
      <section class="content mn-inset" aria-label="Content for this story">
        <!--
          One missing setup step blocks several layers at once — typically no
          OpenRouter key. It is said once, with its one way forward, instead of
          as the same sentence and the same button on every row.
        -->
        @if (sharedSetup(); as setup) {
          <div class="setup-notice mn-notice mn-notice--info" data-testid="shared-setup">
            <p>{{ setup.status }}</p>
            <a class="mn-button" routerLink="/settings" (click)="close()">{{ setup.label }}</a>
          </div>
        }
        <div class="content-rows mn-stack mn-stack--tight">
          @for (row of rows(); track row.layer) {
            <section
              class="content-row"
              tabindex="-1"
              [attr.aria-label]="row.name"
              [attr.data-layer]="row.layer"
            >
              <div class="row-main">
                <div class="row-copy">
                  <strong>{{ row.name }}</strong>
                  <span class="mn-status-pill" role="status">{{
                    sharedSetup() !== null && row.setup ? 'Not set up' : row.status
                  }}</span>
                </div>
                <div class="row-actions mn-actions">
                  @switch (row.action) {
                    @case ('settings') {
                      @if (sharedSetup() === null || !row.setup) {
                        <a class="mn-button" routerLink="/settings" (click)="close()">{{
                          row.label
                        }}</a>
                      }
                    }
                    @case ('credit') {
                      <a
                        class="mn-button"
                        href="https://openrouter.ai/settings/credits"
                        target="_blank"
                        rel="noopener noreferrer"
                        (click)="followCredit(row.layer)"
                        >{{ row.label }}</a
                      >
                    }
                    @case ('prepare') {
                      <button
                        type="button"
                        class="mn-button"
                        [disabled]="row.disabled || pending() === row.layer"
                        (click)="prepare.emit(row.layer)"
                      >
                        {{ pending() === row.layer ? 'Working…' : row.label }}
                      </button>
                    }
                    @case ('cancel') {
                      <button
                        type="button"
                        class="mn-button"
                        [disabled]="pending() === row.layer"
                        (click)="stopRequested.emit(row.layer)"
                      >
                        {{ pending() === row.layer ? 'Stopping…' : row.label }}
                      </button>
                    }
                  }
                  @if (hasSavedLayer(row.layer)) {
                    <button
                      type="button"
                      class="mn-icon-button clear"
                      [attr.aria-label]="clearLabel(row.layer)"
                      [title]="clearLabel(row.layer)"
                      (click)="clearLayer(row.layer)"
                    >
                      <mn-icon name="delete" />
                    </button>
                  }
                </div>
              </div>
              @if (row.error) {
                <p class="row-notice mn-notice mn-notice--error" role="alert">{{ row.error }}</p>
              }
            </section>
          }
        </div>
        @if (error()) {
          <p class="menu-notice mn-notice mn-notice--error" role="alert">{{ error() }}</p>
        }
      </section>
    </mn-sheet-popover>
  `,
  styleUrl: './reader-menu.component.scss',
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
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly viewport = inject(ViewportService);
  private readonly injector = inject(Injector);
  protected readonly isMobile = this.viewport.isMobile;
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
          (row?.querySelector<HTMLElement>('.row-actions a, .row-actions button') ?? row)?.focus();
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
    return { status: first.status, label: text.label };
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
      if (this.isMobile()) {
        this.panel().focusHandle();
      } else {
        this.closeButton()?.nativeElement.focus();
      }
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
  protected onSheetClosed(): void {
    this.close();
  }
}
