import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
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
      (toggle)="onToggle()"
    >
      <header>
        <h2>Story options</h2>
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
      </header>
      <mn-reader-aids />
      <section class="content" aria-label="Content for this story">
        <h3>Content for this story</h3>
        @for (row of rows(); track row.layer) {
          <section class="content-row" [attr.aria-label]="row.name" [attr.data-layer]="row.layer">
            <div class="row-main">
              <div class="row-copy">
                <strong>{{ row.name }}</strong>
                <p role="status">{{ row.status }}</p>
              </div>
              @switch (row.action) {
                @case ('settings') {
                  <a class="mn-button" routerLink="/settings" (click)="close()">{{ row.label }}</a>
                }
                @case ('prepare') {
                  <button
                    type="button"
                    class="mn-button"
                    [disabled]="row.disabled || pending() === row.layer"
                    (click)="prepare.emit(row.layer)"
                  >
                    {{ pending() === row.layer ? 'Saving…' : row.label }}
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
                @case ('listen') {
                  <button type="button" class="mn-button" (click)="listenToStory()">Listen</button>
                }
                @default {
                  @if (row.label) {
                    <span class="ready"><mn-icon name="check" [size]="16" />{{ row.label }}</span>
                  }
                }
              }
            </div>
            @if (row.error) {
              <p class="mn-error" role="alert">{{ row.error }}</p>
            }
            @if (row.layer === 'audio' && hasAudio()) {
              <details class="mn-disclosure maintenance">
                <summary>Audio options</summary>
                <button type="button" class="delete" (click)="deleteAudio()">Delete audio…</button>
              </details>
            }
          </section>
        }
        @if (error()) {
          <p class="mn-error" role="alert">{{ error() }}</p>
        }
      </section>
      <footer>
        <button type="button" class="delete" (click)="deleteStory()">Delete story…</button>
      </footer>
    </section>
  `,
  styleUrl: './reader-menu.component.scss',
})
export class ReaderMenuComponent {
  readonly rows = input.required<readonly ReaderContentState[]>();
  readonly hasAudio = input(false);
  readonly pending = input<PreparationLayer | null>(null);
  readonly error = input<string | null>(null);
  readonly prepare = output<PreparationLayer>();
  readonly opened = output<void>();
  readonly stopRequested = output<PreparationLayer>();
  readonly listen = output<void>();
  readonly deleteAudioRequested = output<void>();
  readonly deleteRequested = output<void>();
  private readonly anchor = viewChild.required<ElementRef<HTMLButtonElement>>('anchor');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  protected readonly menuOpen = signal(false);

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
      this.closeButton().nativeElement.focus();
    }
  }
  protected onEscape(event: Event): void {
    if (this.menuOpen()) {
      event.preventDefault();
      this.close();
    }
  }
  protected listenToStory(): void {
    this.close();
    this.listen.emit();
  }
  protected deleteAudio(): void {
    this.close();
    this.deleteAudioRequested.emit();
  }
  protected deleteStory(): void {
    this.close();
    this.deleteRequested.emit();
  }
}
