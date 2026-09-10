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

const SHEET_DISMISS_DISTANCE_PX = 80;

/** One reader options surface: appearance, saved content, and maintenance. */
@Component({
  selector: 'mn-reader-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, RouterLink, IconComponent, ReaderAidsComponent],
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
    <section
      #panel
      id="mn-reader-menu-panel"
      popover
      class="panel"
      role="dialog"
      aria-label="Story options"
      [cdkTrapFocus]="menuOpen()"
      [style.transform]="dragTransform()"
      [class.is-dragging]="dragOffset() > 0"
      (toggle)="onToggle()"
    >
      @if (isMobile()) {
        <button
          #handle
          type="button"
          class="handle"
          aria-label="Close story options"
          (pointerdown)="onDragStart($event)"
          (pointermove)="onDragMove($event)"
          (pointerup)="onDragEnd()"
          (pointercancel)="onDragEnd()"
          (click)="onHandleClick()"
        >
          <span class="grip" aria-hidden="true"></span>
        </button>
      }
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
      <section class="content" aria-label="Content for this story">
        <div class="content-rows">
          @for (row of rows(); track row.layer) {
            <section class="content-row" [attr.aria-label]="row.name" [attr.data-layer]="row.layer">
              <div class="row-main">
                <div class="row-copy">
                  <strong>{{ row.name }}</strong>
                  <p role="status">{{ row.status }}</p>
                </div>
                <div class="row-actions">
                  @switch (row.action) {
                    @case ('settings') {
                      <a class="mn-button" routerLink="/settings" (click)="close()">{{
                        row.label
                      }}</a>
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
    </section>
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
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly handle = viewChild<ElementRef<HTMLButtonElement>>('handle');
  private readonly viewport = inject(ViewportService);
  protected readonly isMobile = this.viewport.isMobile;
  protected readonly menuOpen = signal(false);
  private readonly dragOffsetSignal = signal(0);
  protected readonly dragOffset = this.dragOffsetSignal.asReadonly();
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffsetSignal();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });
  private dragStartY: number | null = null;
  private dragged = false;

  open(): void {
    this.panel().nativeElement.showPopover();
  }
  close(): void {
    this.panel().nativeElement.hidePopover();
    this.anchor().nativeElement.focus();
  }
  protected onToggle(): void {
    const open = this.panel().nativeElement.matches(':popover-open');
    this.menuOpen.set(open);
    if (open) {
      this.opened.emit();
      (this.isMobile() ? this.handle() : this.closeButton())?.nativeElement.focus();
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
  protected onDragStart(event: PointerEvent): void {
    this.dragStartY = event.clientY;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  protected onDragMove(event: PointerEvent): void {
    if (this.dragStartY === null) return;
    const offset = Math.max(0, event.clientY - this.dragStartY);
    if (offset > 0) this.dragged = true;
    this.dragOffsetSignal.set(offset);
  }

  protected onDragEnd(): void {
    const dismissed = this.dragOffsetSignal() >= SHEET_DISMISS_DISTANCE_PX;
    this.dragStartY = null;
    this.dragOffsetSignal.set(0);
    if (dismissed) this.close();
  }

  protected onHandleClick(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.close();
  }
}
