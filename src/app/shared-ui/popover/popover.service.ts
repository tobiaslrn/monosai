import {
  createBlockScrollStrategy,
  createFlexibleConnectedPositionStrategy,
  createGlobalPositionStrategy,
  createOverlayRef,
  type ConnectedPosition,
  type FlexibleConnectedPositionStrategyOrigin,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  Injectable,
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
   * away, and docks as a sheet on a phone. A non-modal one is a hover preview:
   * it never takes focus, never intercepts a pointer, and stays anchored.
   */
  readonly modal?: boolean;
}

export interface PopoverRef {
  close(): void;
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
const POSITIONS: readonly ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
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

  open(options: PopoverOptions): PopoverRef {
    this.close();

    const modal = options.modal ?? true;
    const sheet = modal && this.viewport.isMobile();
    const overlayRef = createOverlayRef(this.injector, {
      positionStrategy: sheet
        ? createGlobalPositionStrategy(this.injector).bottom('0').left('0')
        : createFlexibleConnectedPositionStrategy(this.injector, options.origin)
            .withFlexibleDimensions(false)
            .withPush(true)
            .withViewportMargin(8)
            .withPositions([...POSITIONS]),
      // A docked sheet covers the text it came from, so the page behind it
      // should not scroll; an anchored popover follows its anchor instead.
      scrollStrategy: sheet ? createBlockScrollStrategy(this.injector) : undefined,
      hasBackdrop: modal,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: panelClasses(modal, sheet),
    });

    overlayRef.attach(new TemplatePortal(options.template, options.viewContainerRef));

    const close = (): void => {
      if (this.overlayRef !== overlayRef) {
        return;
      }
      this.overlayRef = null;
      this.closeCurrent = null;
      overlayRef.dispose();
      options.returnFocusTo?.focus();
      options.onClosed?.();
    };

    overlayRef.backdropClick().subscribe(close);
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });

    this.overlayRef = overlayRef;
    this.closeCurrent = close;
    return { close };
  }

  /** Closes whatever is open. Safe to call when nothing is. */
  close(): void {
    this.closeCurrent?.();
  }
}
