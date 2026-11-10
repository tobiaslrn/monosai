/**
 * What a list that drops from a control owes the page while it is open, in
 * every app that has such lists:
 *
 * - Back closes it. It takes one history entry while it is open, so the
 *   browser's Back (the Android back gesture) lands on that entry and closes
 *   the list instead of leaving the page. The `popstate` is swallowed in the
 *   capture phase, so neither the router nor a dialog that closes on
 *   navigation ever sees it. When the list closes any other way, its entry is
 *   taken back off, and that `popstate` is swallowed too.
 * - A press outside only closes it. The press that dismisses a native popover
 *   still goes on to click whatever was under it; the click that follows is
 *   stopped, so tapping away never also activates the row, link, or button
 *   beneath.
 *
 * One instance per list; it listens only while the list is open.
 */
const ENTRY_KEY = 'monosaiOverlayEntry';
/** How long after a dismissing press a click can still be the same gesture's. */
const CLICK_WINDOW_MS = 600;

interface HistoryEntry {
  readonly id: number;
  pushed: boolean;
  readonly close: () => void;
}

const open: HistoryEntry[] = [];
let sequence = 0;
/** Entries this module took back off itself, whose `popstate` is not the learner's. */
let ownPops = 0;
let installed = false;

function entryOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const id = (state as Record<string, unknown>)[ENTRY_KEY];
  return typeof id === 'number' ? id : null;
}

function onPopState(event: PopStateEvent): void {
  if (ownPops > 0) {
    ownPops--;
    event.stopImmediatePropagation();
    return;
  }
  const top = open[open.length - 1];
  if (top?.pushed !== true || entryOf(history.state) === top.id) {
    return;
  }
  // Back has left the entry this list took: it is the list that goes, not the page.
  top.pushed = false;
  open.pop();
  event.stopImmediatePropagation();
  top.close();
}

/**
 * Listens for Back ahead of every other `popstate` listener, which is why the
 * app calls this before it starts: listeners on the window run in the order
 * they were added, and the router's and a dialog's must not see a Back that
 * only closed a list.
 */
export function installOverlayHistory(): void {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('popstate', onPopState, { capture: true });
}

/** Whether a click on `click` is the end of a press on `pressed`: the same element, or one inside the other. */
function sameGesture(pressed: Node, click: Node): boolean {
  const page = (node: Node): boolean => node === document.body || node === document.documentElement;
  if (pressed === click) {
    return true;
  }
  return (pressed.contains(click) && !page(pressed)) || (click.contains(pressed) && !page(click));
}

export class OpenOverlayGuard {
  private entry: HistoryEntry | null = null;
  private clickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly options: {
      /** The list. A press inside it is not a press outside. */
      readonly panel: HTMLElement;
      /** The control that opened it; a press on that is the control's own. */
      readonly trigger: () => Element | null;
      /** Closes the list. */
      readonly close: () => void;
    },
  ) {}

  /** Called as the list opens. */
  start(): void {
    this.pushEntry();
    document.addEventListener('pointerdown', this.onPress, { capture: true, passive: true });
  }

  /** Called once the list has closed. */
  stop(): void {
    document.removeEventListener('pointerdown', this.onPress, { capture: true });
    this.popEntry();
  }

  private pushEntry(): void {
    // An entry still being taken off is not a place to stack another on.
    if (this.entry !== null || ownPops > 0 || typeof history.pushState !== 'function') {
      return;
    }
    installOverlayHistory();
    const entry: HistoryEntry = { id: ++sequence, pushed: true, close: this.options.close };
    history.pushState({ ...((history.state as object | null) ?? {}), [ENTRY_KEY]: entry.id }, '');
    open.push(entry);
    this.entry = entry;
  }

  private popEntry(): void {
    const entry = this.entry;
    this.entry = null;
    if (entry === null) {
      return;
    }
    const index = open.indexOf(entry);
    if (index >= 0) {
      open.splice(index, 1);
    }
    if (entry.pushed && entryOf(history.state) === entry.id) {
      entry.pushed = false;
      ownPops++;
      history.back();
    }
  }

  private readonly onPress = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node) || this.options.panel.contains(target)) {
      return;
    }
    if (this.options.trigger()?.contains(target) === true) {
      return;
    }
    this.swallowNextClick(target);
  };

  private pressed: Node | null = null;

  private readonly stopClick = (click: Event): void => {
    const target = click.target;
    const pressed = this.pressed;
    this.releaseClick();
    // Only the click that ends that press: it lands on what the press did.
    if (pressed !== null && target instanceof Node && sameGesture(pressed, target)) {
      click.preventDefault();
      click.stopPropagation();
    }
  };

  private releaseClick(): void {
    window.removeEventListener('click', this.stopClick, { capture: true });
    if (this.clickTimer !== null) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
  }

  private swallowNextClick(pressed: Node): void {
    this.releaseClick();
    this.pressed = pressed;
    window.addEventListener('click', this.stopClick, { capture: true });
    this.clickTimer = setTimeout(() => {
      this.releaseClick();
    }, CLICK_WINDOW_MS);
  }
}
