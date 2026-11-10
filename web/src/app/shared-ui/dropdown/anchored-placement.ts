/**
 * Where a dropdown or a menu hangs from the control that opened it. It is the
 * one placement rule for both, so every list that drops from a field or a
 * button lands the same way on every screen size:
 *
 * - Below the trigger, and above it only when the content does not fit below
 *   and there is more room above. The room is measured in the visual viewport,
 *   so an on-screen keyboard that covers the lower half moves it up rather than
 *   hiding it.
 * - Starting at the trigger's start edge, so a list begins where its field
 *   does. Where it would leave the column from there, it ends at the trigger's
 *   end edge instead, and then it is held inside the column. The column is the
 *   page's (`mn-page`), or an overlay's body when the trigger sits in a
 *   dialog, never closer than the overlay margin to the window's edge.
 * - At least as wide as the trigger when it is a dropdown, which is the panel's
 *   own width rule reading `--anchored-field-width`; it grows with its content
 *   up to its own maximum and never past the column.
 *
 * It writes the room it found to the panel as `--anchored-room-inline` and
 * `--anchored-room-block`, which the panel's own width and height rules clamp
 * to, the trigger's width as `--anchored-field-width`, and the panel's place as
 * `left` and `top`. It measures the panel once it
 * is laid out, from a `ResizeObserver` on its content: that runs after layout
 * and before paint, so the first frame is already in place. While the panel is
 * open it follows the trigger through scrolling, a resize, and the visual
 * viewport moving; nothing is listened to while it is closed.
 */
export interface AnchoredPlacementOptions {
  /** The panel: a `position: fixed` native popover. */
  readonly panel: HTMLElement;
  /** The control it hangs from, found when it opens. */
  readonly trigger: () => Element | null;
  /**
   * The element that scrolls inside the panel (the panel itself for a menu).
   * Its one child is the content, whose size is what the placement follows.
   */
  readonly scroller: () => HTMLElement | null;
  /** The custom property that caps the panel's height, if any. */
  readonly maxHeightToken?: string;
}

/** What a trigger is laid out in: an overlay's body, else the page's column. */
const COLUMN = '.mn-overlay__body, mn-page, .mn-page, main';
/** A panel this close to the column's end still counts as inside it. */
const EDGE_TOLERANCE = 1;

interface Box {
  readonly left: number;
  readonly right: number;
}

export class AnchoredPlacement {
  private above = false;
  private frame = 0;
  private observer: ResizeObserver | null = null;
  private readonly follow = (): void => {
    if (this.frame !== 0) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.place();
    });
  };

  constructor(private readonly options: AnchoredPlacementOptions) {}

  /** Called as the panel starts to open, ahead of its first frame. */
  open(): void {
    this.above = false;
    this.options.panel.classList.remove('is-above');
    this.writeRoom();
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        this.place();
      });
      // The content, never the panel: the panel's height is what placing it
      // changes, and observing that would ask for a second pass every time.
      const content = this.options.scroller()?.firstElementChild;
      if (content) {
        this.observer.observe(content);
      }
    }
    window.addEventListener('scroll', this.follow, { capture: true, passive: true });
    window.addEventListener('resize', this.follow, { passive: true });
    window.visualViewport?.addEventListener('resize', this.follow, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.follow, { passive: true });
  }

  /** Called once the panel has closed: it stops following the trigger. */
  close(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    window.removeEventListener('scroll', this.follow, { capture: true });
    window.removeEventListener('resize', this.follow);
    window.visualViewport?.removeEventListener('resize', this.follow);
    window.visualViewport?.removeEventListener('scroll', this.follow);
  }

  /** Puts the panel in its place for the trigger as it is now. */
  place(): void {
    const { panel } = this.options;
    const trigger = this.options.trigger();
    if (trigger === null || !panel.isConnected) {
      return;
    }
    const field = trigger.getBoundingClientRect();
    const column = this.writeRoom(trigger);
    const own = panel.getBoundingClientRect();
    if (own.width === 0) {
      return;
    }

    // Across: from the edge the trigger shares with the column, held inside it.
    const width = Math.min(own.width, column.right - column.left);
    const fits = field.left + width <= column.right + EDGE_TOLERANCE;
    const wanted = fits ? field.left : field.right - width;
    const left = Math.min(Math.max(wanted, column.left), column.right - width);

    // Down, or up when it does not fit below and there is more room above.
    const offset = this.length('--overlay-offset');
    const margin = this.length('--overlay-margin');
    const view = window.visualViewport;
    const viewTop = view?.offsetTop ?? 0;
    const viewBottom = viewTop + (view?.height ?? window.innerHeight);
    const below = viewBottom - margin - (field.bottom + offset);
    const above = field.top - offset - (viewTop + margin);
    const needed = Math.min(this.naturalHeight(own.height), this.cap());
    if (this.above ? above < needed && below > above : below < needed && above > below) {
      this.above = !this.above;
    }
    const room = Math.max(0, this.above ? above : below);
    const height = Math.min(needed, room);
    const top = this.above ? field.top - offset - height : field.bottom + offset;

    panel.classList.toggle('is-above', this.above);
    panel.style.setProperty('--anchored-room-block', `${String(room)}px`);
    panel.style.left = `${String(left)}px`;
    panel.style.top = `${String(top)}px`;
  }

  /**
   * Writes how wide the column lets the panel be, so its first layout already
   * has the width it will keep. Returns the column.
   */
  private writeRoom(trigger = this.options.trigger()): Box {
    const column = trigger === null ? this.viewportBox() : this.columnOf(trigger);
    this.options.panel.style.setProperty(
      '--anchored-field-width',
      `${String(trigger?.getBoundingClientRect().width ?? 0)}px`,
    );
    this.options.panel.style.setProperty(
      '--anchored-room-inline',
      `${String(Math.max(0, column.right - column.left))}px`,
    );
    return column;
  }

  private columnOf(trigger: Element): Box {
    const viewport = this.viewportBox();
    const holder = trigger.closest(COLUMN);
    if (holder === null) {
      return viewport;
    }
    const box = holder.getBoundingClientRect();
    const style = getComputedStyle(holder);
    const left = box.left + (parseFloat(style.paddingLeft) || 0);
    const right = box.right - (parseFloat(style.paddingRight) || 0);
    return { left: Math.max(left, viewport.left), right: Math.min(right, viewport.right) };
  }

  private viewportBox(): Box {
    const margin = this.length('--overlay-margin');
    const view = window.visualViewport;
    const left = view?.offsetLeft ?? 0;
    const width = view?.width ?? document.documentElement.clientWidth;
    return {
      left: left + margin,
      right: Math.min(left + width, document.documentElement.clientWidth) - margin,
    };
  }

  /** The panel's height with nothing cut: its frame plus all that its scroller holds. */
  private naturalHeight(shown: number): number {
    const scroller = this.options.scroller();
    if (scroller === null) {
      return shown;
    }
    return shown - scroller.clientHeight + scroller.scrollHeight;
  }

  private cap(): number {
    const token = this.options.maxHeightToken;
    return token === undefined ? Infinity : this.length(token) || Infinity;
  }

  /** A length token in pixels: a `px`, `rem` or `em` value, the forms the tokens take. */
  private length(token: string): number {
    const value = getComputedStyle(this.options.panel).getPropertyValue(token).trim();
    const amount = parseFloat(value);
    if (Number.isNaN(amount)) {
      return 0;
    }
    if (value.endsWith('rem')) {
      return amount * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    }
    if (value.endsWith('em')) {
      return amount * (parseFloat(getComputedStyle(this.options.panel).fontSize) || 16);
    }
    return amount;
  }
}
