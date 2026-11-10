import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { OverlayHeaderComponent } from '../dialog/overlay-header.component';
import { SheetHandleComponent } from '../sheet/sheet-handle.component';

interface NativePopoverElement extends Omit<HTMLElement, 'hidePopover' | 'showPopover'> {
  readonly hidePopover?: () => void;
  readonly showPopover?: () => void;
}

let nextOverlayId = 0;

/**
 * The overlay surface held up by a native popover: a task dialog that must
 * outlive a file chooser or wants light dismissal, and the reader's Story
 * options. A choice from a list is never this but the dropdown (`mn-dropdown`).
 *
 *   <button mnButton [mnOverlayTrigger]="panel" aria-haspopup="dialog">Add source</button>
 *   <mn-sheet-popover #panel="mnSheetPopover" heading="Add words" placement="centred"
 *                     [modal]="true" role="dialog" (dismissed)="panel.hide()">
 *     …the body…
 *     <button mn-dialog-action mnButton="primary" type="button">Try again</button>
 *   </mn-sheet-popover>
 *
 * It is the shared overlay surface (`_overlay.scss`) with the shared header:
 * the title, a back arrow for a step below the first (`backLabel`), and a close
 * on a wide viewport. On a phone it docks to the bottom edge as a sheet with a
 * grab handle instead. On a wide viewport `placement` decides where it floats:
 *
 *   centred    a task dialog: in the middle of the window, over a scrim
 *   anchored   hanging from its trigger, from the edge the trigger shares
 *              with the page's column (Story options)
 *
 * The native popover stays on the host so it light-dismisses, survives a file
 * chooser, keeps the accessible relationship with its trigger, and returns
 * focus to it. Focus moves in when it opens — to a `[data-overlay-focus]` control, else
 * the close, or the handle when docked — and is held inside while it is open.
 * `[mn-dialog-pinned]` content sits above the body and stays put while it
 * scrolls; `[mn-dialog-action]` content is the footer.
 */
@Component({
  selector: 'mn-sheet-popover',
  exportAs: 'mnSheetPopover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayHeaderComponent, SheetHandleComponent],
  hostDirectives: [CdkTrapFocus],
  host: {
    popover: 'auto',
    class: 'mn-overlay',
    '[attr.id]': 'id()',
    '[attr.aria-labelledby]': 'label() === null ? headingId : null',
    '[attr.aria-label]': 'label()',
    '[class.mn-overlay--docked]': 'docked()',
    '[class.mn-overlay--dialog]': "!docked() && placement() === 'centred'",
    '[class.mn-overlay--panel]': "!docked() && placement() === 'anchored'",
    '[class.is-centred]': "!docked() && placement() === 'centred'",
    '[class.is-anchored]': "!docked() && placement() === 'anchored'",
    '[class.is-dragging]': 'dragOffset() > 0',
    '[style.transform]': 'dragTransform()',
    '[style.position-anchor]': "!docked() && placement() === 'anchored' ? anchorName() : null",
    '[attr.data-modal]': "modal() ? '' : null",
    '(beforetoggle)': 'onBeforeToggle($event)',
    '(toggle)': 'onToggle()',
  },
  template: `
    @if (docked()) {
      <mn-sheet-handle #handle [label]="closeLabel()" (dismissed)="dismissed.emit()" />
    }
    <mn-overlay-header
      [heading]="heading()"
      [headingId]="headingId"
      [backLabel]="backLabel()"
      [closeLabel]="docked() ? null : closeLabel()"
      (back)="back.emit()"
      (dismissed)="dismissed.emit()"
    />
    <div class="mn-overlay__pinned"><ng-content select="[mn-dialog-pinned]" /></div>
    <div class="mn-overlay__body"><ng-content /></div>
    <div class="mn-overlay__footer"><ng-content select="[mn-dialog-action]" /></div>
  `,
  styles: `
    @use '../../../styles/motion' as motion;
    @use '../../../styles/breakpoints' as breakpoints;

    :host {
      position: fixed;
      z-index: 10;
    }

    :host(:not(:popover-open)) {
      display: none;
    }

    /* Centred: the popover's own centring, the height of its content. */
    :host(.is-centred) {
      inset: 0;
      height: fit-content;
      margin: auto;
      @include motion.grow(center);
    }

    :host(.is-anchored) {
      inset: auto;
      margin: var(--overlay-offset) 0 0;
      position-area: bottom span-left;
      position-try-fallbacks:
        flip-block,
        flip-inline,
        flip-block flip-inline;
      max-height: calc(100dvh - 2 * var(--overlay-margin) - var(--touch-target));
      @include motion.grow(top right);
    }

    /*
     * An anchored overlay never leaves the page's column: it is end-aligned to
     * its trigger, and start-aligned when the trigger sits in the column's
     * first half.
     */
    :host(.is-anchored.is-start) {
      position-area: bottom span-right;
    }

    :host(.mn-overlay--docked) {
      /* A docked sheet spans the viewport, so it drops the anchor's
         position-area box. Keeping it would inset the sheet to the
         trigger's edge and leave a bare strip down the side. */
      position-area: none;
      inset: auto 0 0;
      margin: 0;
      @include motion.sheet;
    }

    /* On its way out it is no longer a surface: a tap lands on the page behind it. */
    :host(.mn-overlay--docked:not(:popover-open)) {
      pointer-events: none;
    }

    /*
     * A modal overlay dims the page: docked, or centred as a task dialog.
     * Hanging from its trigger on a wide screen, it leaves the page in view.
     */
    :host([data-modal]:is(.mn-overlay--docked, .is-centred))::backdrop {
      background-color: var(--overlay-scrim);
    }

    /* The scrim fades in with the surface and out with it, never cutting out from behind it. */
    :host([data-modal]:is(.mn-overlay--docked, .is-centred))::backdrop {
      @include motion.scrim-transition;
    }

    :host([data-modal]:is(.mn-overlay--docked, .is-centred):not(:popover-open))::backdrop {
      background-color: transparent;
    }

    :host([data-modal]:is(.mn-overlay--docked, .is-centred):popover-open)::backdrop {
      @starting-style {
        background-color: transparent;
      }
    }

    :host(.is-dragging) {
      transition: none;
    }
  `,
})
export class SheetPopoverComponent {
  private readonly instance = nextOverlayId++;
  /** The popover's id, which its trigger names; generated unless one is given. */
  readonly id = input(`mn-overlay-${String(this.instance)}`);
  /** The anchor name the trigger takes and an anchored overlay hangs from. */
  readonly anchorName = input(`--mn-overlay-${String(this.instance)}`);
  /** The title, and the overlay's accessible name. */
  readonly heading = input.required<string>();
  /**
   * The overlay's accessible name when it is not the title: a task in steps
   * keeps one name while each step titles itself.
   */
  readonly label = input<string | null>(null);
  readonly placement = input<'anchored' | 'centred'>('anchored');
  /** Names the back arrow of a step below the first; without one there is none. */
  readonly backLabel = input<string | null>(null);
  /** Names the close on a wide viewport and the grab handle when docked. */
  readonly closeLabel = input('Close');
  /** Dims the page behind it when it is docked or centred. */
  readonly modal = input(false);
  /** The handle or the close was pressed: the owner puts the overlay away. */
  readonly dismissed = output<void>();
  readonly back = output<void>();
  readonly opened = output<void>();
  readonly closed = output<void>();

  protected readonly headingId = `mn-overlay-${String(this.instance)}-title`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trap = inject(CdkTrapFocus);
  private readonly viewport = inject(ViewportService);
  private readonly handle = viewChild<SheetHandleComponent>('handle');
  private readonly openState = signal(false);

  /** Whether it is showing, set before the first frame of showing. */
  readonly isOpen = this.openState.asReadonly();
  protected readonly docked = this.viewport.isMobile;
  protected readonly dragOffset = computed(() => this.handle()?.offset() ?? 0);
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });

  constructor() {
    this.trap.enabled = false;
  }

  /** The native popover element for the owning feature's open/close lifecycle. */
  element(): HTMLElement {
    return this.host.nativeElement;
  }

  show(): void {
    (this.host.nativeElement as NativePopoverElement).showPopover?.();
  }

  hide(): void {
    this.settleDrag();
    (this.host.nativeElement as NativePopoverElement).hidePopover?.();
  }

  focusHandle(): void {
    this.handle()?.focus();
  }

  protected onBeforeToggle(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    this.openState.set(open);
    if (open) {
      this.alignToColumn();
    }
  }

  /**
   * Chooses which edge of the trigger an anchored overlay hangs from, so it
   * stays inside the page's column: the start edge when the trigger is in the
   * column's first half, the end edge otherwise. Written straight to the host,
   * ahead of the first frame of showing.
   */
  private alignToColumn(): void {
    const root = this.host.nativeElement;
    const trigger = document.querySelector(`[popovertarget="${this.id()}"]`);
    if (trigger === null) {
      return;
    }
    const column = trigger.closest('mn-page, main') ?? document.documentElement;
    const columnBox = column.getBoundingClientRect();
    const box = trigger.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    root.classList.toggle('is-start', centre < columnBox.left + columnBox.width / 2);
  }

  /**
   * Whether it is open is read from the element rather than remembered: a
   * panel the browser hides because its node was moved fires no `beforetoggle`
   * the owner could have seen.
   */
  protected onToggle(): void {
    const open = this.host.nativeElement.matches(':popover-open');
    this.openState.set(open);
    this.trap.enabled = open;
    if (open) {
      this.focusInside();
      this.opened.emit();
    } else {
      this.closed.emit();
    }
  }

  private focusInside(): void {
    const root = this.host.nativeElement;
    const wanted = root.querySelector<HTMLElement>('[data-overlay-focus]');
    if (wanted !== null) {
      wanted.focus();
      return;
    }
    if (this.docked()) {
      this.focusHandle();
      return;
    }
    root.querySelector<HTMLElement>('[data-overlay-close]')?.focus();
  }

  /**
   * Ends a drag on the host itself, ahead of the change detection that will do
   * the same.
   *
   * A sheet is usually closed from the gesture that dismissed it, and the
   * browser recalculates style before Angular writes the released state back.
   * It would see a sheet still pinned to the finger and transition-free, and so
   * cut it away instead of sending it down. Writing the settled state here is
   * what the next change detection writes anyway, so the two agree.
   */
  private settleDrag(): void {
    const host = this.host.nativeElement;
    host.classList.remove('is-dragging');
    host.style.removeProperty('transform');
  }
}

/** The control that opens an `mn-sheet-popover`: it names the overlay and anchors it. */
@Directive({
  selector: '[mnOverlayTrigger]',
  host: {
    '[attr.popovertarget]': 'overlay().id()',
    '[attr.aria-controls]': 'overlay().id()',
    '[attr.aria-expanded]': 'overlay().isOpen()',
    '[style.anchor-name]': 'overlay().anchorName()',
  },
})
export class OverlayTriggerDirective {
  readonly overlay = input.required<SheetPopoverComponent>({ alias: 'mnOverlayTrigger' });
}
