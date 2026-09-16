import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
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
      popover
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
            <section class="content-row" [attr.aria-label]="row.name" [attr.data-layer]="row.layer">
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
                    @case ('prepare') {
                      <!--
                        Preparing a layer is a request to the provider. The mark
                        says so before the button is pressed; stopping one and
                        opening Settings do not carry it, because neither
                        spends anything.
                      -->
                      <button
                        type="button"
                        class="mn-button"
                        [disabled]="row.disabled || pending() === row.layer"
                        (click)="prepare.emit(row.layer)"
                      >
                        <mn-icon name="generate" [size]="16" />
                        <span>{{ pending() === row.layer ? 'Working…' : row.label }}</span>
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
  readonly stopRequested = output<PreparationLayer>();
  readonly deleteAudioRequested = output<void>();
  readonly clearAidRequested = output<'english' | 'grammar'>();
  private readonly anchor = viewChild.required<ElementRef<HTMLButtonElement>>('anchor');
  private readonly panel = viewChild.required(SheetPopoverComponent);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly viewport = inject(ViewportService);
  protected readonly isMobile = this.viewport.isMobile;
  protected readonly menuOpen = signal(false);

  /**
   * The setup step two or more rows are waiting on, when they all wait on the
   * same one. Its label is the text layers' way to Settings, since audio's
   * own voice setup lives on the player.
   */
  protected readonly sharedSetup = computed(() => {
    const waiting = this.rows().filter((row) => row.setup);
    const first = waiting[0];
    if (waiting.length < 2 || waiting.some((row) => row.status !== first.status)) {
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
  protected onToggle(): void {
    const open = this.panel().isOpen();
    this.menuOpen.set(open);
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
