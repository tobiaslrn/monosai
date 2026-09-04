import {
  createFlexibleConnectedPositionStrategy,
  createGlobalPositionStrategy,
  createOverlayRef,
  type ConnectedPosition,
  type FlexibleConnectedPositionStrategyOrigin,
  type OverlayRef,
  type PositionStrategy,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  Injectable,
  effect,
  inject,
  Injector,
  type TemplateRef,
  type ViewContainerRef,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';

/** What a floating surface is anchored to: an element, or a pointer position. */
export type PopoverOrigin = FlexibleConnectedPositionStrategyOrigin;

export interface PopoverOptions {
  readonly origin: PopoverOrigin;
  readonly template: TemplateRef<unknown>;
  readonly viewContainerRef: ViewContainerRef;
  /**
   * Where focus goes when the popover closes. Without it a dismissal drops
   * focus to the document and a keyboard reader loses their place.
   */
  readonly returnFocusTo?: HTMLElement | null;
  /** Called once, whether the popover was dismissed or closed by its content. */
  readonly onClosed?: () => void;
  /**
   * A modal popover (the default) takes focus, dismisses on `Escape` or a click
   * away, and docks as a sheet on a phone unless `mobileSheet` is false. A
   * non-modal one is a hover preview: it never takes focus, never intercepts a
   * pointer, and stays anchored.
   */
  readonly modal?: boolean;
  /** Whether a modal surface should dock to the bottom on a mobile viewport. */
  readonly mobileSheet?: boolean;
  /**
   * Elements an outside press should reach after dismissing this surface.
   *
   * Dismissal normally eats the click it was answering, so that putting a
   * surface away never also acts on whatever was underneath it. A word is the
   * exception: with a surface open, every tap on the next word was spent
   * closing the previous one, and the reader had to tap the same word twice to
   * read it. A press on a matching target dismisses nothing and keeps its
   * click, leaving what happens next to whatever handles it.
   */
  readonly retargetSelector?: string;
  /**
   * Closes the popover as soon as the page scrolls.
   *
   * What a reader anchored to a word or a line should do when that line moves:
   * following it would drag a card down the page while they are trying to read
   * past it, so scrolling is taken as "done with this".
   */
  readonly closeOnScroll?: boolean;
  /** Which side of an anchored origin gets first choice when both fit. */
  readonly preferredVerticalPlacement?: 'above' | 'below';
}

export interface PopoverRef {
  close(): void;
}

function positionStrategy(
  injector: Injector,
  options: PopoverOptions,
  sheet: boolean,
): PositionStrategy {
  if (sheet) {
    return createGlobalPositionStrategy(injector)
      .bottom('var(--mn-docked-player-height, 0px)')
      .left('0');
  }
  return createFlexibleConnectedPositionStrategy(injector, options.origin)
    .withFlexibleDimensions(false)
    .withPush(true)
    .withViewportMargin(8)
    .withPositions(
      options.preferredVerticalPlacement === 'above'
        ? [...ABOVE_FIRST_POSITIONS]
        : [...BELOW_FIRST_POSITIONS],
    );
}

/**
 * Whether the click this press is about to produce belongs to its target
 * rather than to the surface that was just dismissed.
 */
function retargets(event: PointerEvent, selector: string | undefined): boolean {
  if (selector === undefined) {
    return false;
  }
  const target = event.target;
  const element = target instanceof Element ? target : null;
  return element !== null && element.closest(selector) !== null;
}

function panelClasses(modal: boolean, sheet: boolean): string[] {
  const classes = ['mn-popover-pane'];
  if (sheet) {
    classes.push('is-sheet');
  }
  if (!modal) {
    classes.push('is-preview');
  }
  return classes;
}

/**
 * Below the anchor first, above it when there is no room, and pushed back
 * inside the viewport when neither fits — the anchor is often a word at the
 * very edge of a line.
 */
/** How far an outside press may travel and still count as a tap, not a scroll. */
const OUTSIDE_TAP_TOLERANCE_PX = 10;

const BELOW_FIRST_POSITIONS: readonly ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
];

const ABOVE_FIRST_POSITIONS: readonly ConnectedPosition[] = [
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
];

/**
 * Opens the reader's floating surfaces on the CDK overlay.
 *
 * Exactly one is open at a time: opening a second closes the first, so a word
 * popover and a sentence menu can never both hover over the same text. The
 * service owns everything that is the same for both — positioning, `Escape`,
 * dismissal by clicking away, and returning focus — while `ReaderPopoverComponent`
 * owns the card and its focus trap.
 */
@Injectable({ providedIn: 'root' })
export class PopoverService {
  private readonly injector = inject(Injector);
  private readonly viewport = inject(ViewportService);

  private overlayRef: OverlayRef | null = null;
  private closeCurrent: (() => void) | null = null;
  private currentMode: {
    readonly overlay: OverlayRef;
    readonly options: PopoverOptions;
    readonly modal: boolean;
  } | null = null;

  constructor() {
    // The same open surface must follow a phone rotation or a resize across
    // the breakpoint. Its card changes through ViewportService, while this
    // service updates the pane's position and sheet class to match.
    effect(() => {
      this.viewport.isMobile();
      const current = this.currentMode;
      if (current !== null) {
        this.syncViewportMode(current.overlay, current.options, current.modal);
      }
    });
  }

  open(options: PopoverOptions): PopoverRef {
    this.close();

    const modal = options.modal ?? true;
    const sheet = modal && options.mobileSheet !== false && this.viewport.isMobile();
    const overlayRef = createOverlayRef(this.injector, {
      positionStrategy: positionStrategy(this.injector, options, sheet),
      // Nothing is blocked or repositioned by scrolling. A docked sheet is
      // fixed to an edge rather than to a line, so the reading is free to move
      // behind it — which is what makes it possible to read on with a
      // translation still open. An anchored card closes instead, through
      // `closeOnScroll`, because it would otherwise drag down the page.
      scrollStrategy: undefined,
      hasBackdrop: modal,
      backdropClass: ['cdk-overlay-transparent-backdrop', 'reader-popover-backdrop'],
      panelClass: panelClasses(modal, sheet),
      // The reader's independent audio player must be able to stack above
      // these surfaces. Native popovers live in the browser top layer, where
      // no regular fixed surface can be placed above them; PopoverService
      // already owns the focus and dismissal behavior we need here.
      usePopover: false,
    });

    overlayRef.attach(new TemplatePortal(options.template, options.viewContainerRef));

    const close = (): void => {
      if (this.overlayRef !== overlayRef) {
        return;
      }
      this.overlayRef = null;
      this.currentMode = null;
      this.closeCurrent = null;
      overlayRef.dispose();
      options.returnFocusTo?.focus();
      options.onClosed?.();
    };

    if (modal) {
      /**
       * The transparent CDK backdrop still owns dismissal, but it cannot own
       * pointer hit-testing: the reader header and independent audio player
       * deliberately sit above it. The same outside-press rule is captured
       * here, letting the Audio toggle receive its own press without
       * dismissing the current popover.
       *
       * Dismissal waits for the release rather than acting on the press,
       * because a press outside a docked sheet is as often the start of a
       * scroll as it is a dismissal: closing on the press meant a reader could
       * not scroll on with a translation open. A press that travels is a
       * scroll and leaves the surface alone; one that stays put is a tap and
       * closes it.
       */
      let origin: { x: number; y: number } | null = null;
      const isOutside = (event: Event): boolean => {
        const target = event.target;
        if (!(target instanceof Node) || overlayRef.overlayElement.contains(target)) {
          return false;
        }
        const element = target instanceof Element ? target : target.parentElement;
        return element?.closest('.audio-button') === null;
      };
      const onPointerDown = (event: PointerEvent): void => {
        origin = isOutside(event) ? { x: event.clientX, y: event.clientY } : null;
      };
      const onPointerUp = (event: PointerEvent): void => {
        const start = origin;
        origin = null;
        if (start === null || !isOutside(event)) {
          return;
        }
        const travelled =
          Math.abs(event.clientX - start.x) > OUTSIDE_TAP_TOLERANCE_PX ||
          Math.abs(event.clientY - start.y) > OUTSIDE_TAP_TOLERANCE_PX;
        if (travelled) {
          return;
        }
        if (retargets(event, options.retargetSelector)) {
          // Left open and left alone: the click this press is about to produce
          // decides what happens, which is what lets pressing the open word
          // put it away and pressing the next one move on to it.
          return;
        }
        close();
        // The click this release is about to produce belonged to dismissing
        // the surface, and must not also act on whatever is underneath.
        const swallow = (click: Event): void => {
          click.preventDefault();
          click.stopPropagation();
        };
        document.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => {
          document.removeEventListener('click', swallow, { capture: true });
        });
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('pointerup', onPointerUp, true);
      overlayRef.detachments().subscribe(() => {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('pointerup', onPointerUp, true);
      });
    }

    if (options.closeOnScroll === true) {
      // Armed a frame late and closes an anchored card on scrolls outside it.
      // A docked sheet ignores those scrolls: it is fixed to an edge rather
      // than to the line that moved, so scrolling past the sentence it
      // explains is exactly what a reader does while reading its translation.
      const onScroll = (event: Event): void => {
        if (this.isSheet(options, modal)) {
          return;
        }
        if (!overlayRef.overlayElement.contains(event.target as Node)) {
          close();
        }
      };
      const frame = requestAnimationFrame(() => {
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      });
      overlayRef.detachments().subscribe(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onScroll, { capture: true });
      });
    }

    overlayRef.backdropClick().subscribe(close);
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });

    this.overlayRef = overlayRef;
    this.currentMode = { overlay: overlayRef, options, modal };
    this.closeCurrent = close;
    this.syncViewportMode(overlayRef, options, modal);
    return { close };
  }

  /** Closes whatever is open. Safe to call when nothing is. */
  close(): void {
    this.closeCurrent?.();
  }

  private isSheet(options: PopoverOptions, modal: boolean): boolean {
    return modal && options.mobileSheet !== false && this.viewport.isMobile();
  }

  private syncViewportMode(overlay: OverlayRef, options: PopoverOptions, modal: boolean): void {
    if (this.overlayRef !== overlay) {
      return;
    }
    const sheet = this.isSheet(options, modal);
    overlay.updatePositionStrategy(positionStrategy(this.injector, options, sheet));
    if (sheet) {
      overlay.addPanelClass('is-sheet');
    } else {
      overlay.removePanelClass('is-sheet');
    }
    overlay.updatePosition();
  }
}
