/**
 * What an overlay owes the page while it is open, in every app that has
 * overlays:
 *
 * - Back closes it (`OverlayHistoryEntry`). It takes one history entry while
 *   it is open, so the browser's Back (the Android back gesture) lands on that
 *   entry and closes the overlay instead of leaving the page. The `popstate`
 *   is swallowed in the capture phase, so neither the router nor a dialog that
 *   closes on navigation ever sees it. When the overlay closes any other way,
 *   its entry is taken back off, and that `popstate` is swallowed too. An
 *   overlay that opens while another's entry is still coming off takes its
 *   own once that has settled, so one replacing another keeps Back. An entry
 *   that cannot be taken off because a page or another overlay now sits on
 *   top of it is passed over when Back reaches it, so it never costs the
 *   learner a second press.
 * - A press outside a list that drops from a control only closes it
 *   (`OpenOverlayGuard`). The press that dismisses a native popover still
 *   goes on to click whatever was under it; the click that follows is
 *   stopped, so tapping away never also activates the row, link, or button
 *   beneath.
 *
 * One instance per overlay; it listens only while the overlay is open.
 */
const ENTRY_KEY = 'monosaiOverlayEntry';
/** How long after a dismissing press a click can still be the same gesture's. */
const CLICK_WINDOW_MS = 600;

interface HistoryEntry {
  readonly id: number;
  /** In history (`pushed`), or open and waiting for an entry still coming off. */
  place: 'pushed' | 'waiting' | 'gone';
  readonly close: () => void;
}

/** The open overlays' entries, bottom first. */
const open: HistoryEntry[] = [];
let sequence = 0;
/** Entries this module took back off itself, whose `popstate` is not the learner's. */
let ownPops = 0;
/** Entries whose overlay closed while something else sat on top of them in history. */
const buried = new Set<number>();
let installed = false;

function entryOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const id = (state as Record<string, unknown>)[ENTRY_KEY];
  return typeof id === 'number' ? id : null;
}

function pushState(entry: HistoryEntry): void {
  history.pushState({ ...((history.state as object | null) ?? {}), [ENTRY_KEY]: entry.id }, '');
  entry.place = 'pushed';
}

/** Takes one entry off; its `popstate` is this module's, not the learner's. */
function goBackQuietly(): void {
  ownPops++;
  history.back();
}

/** An entry left behind by an overlay that has closed is no place to stop: Back goes on past it. */
function passOver(landed: number | null): void {
  if (landed !== null && buried.delete(landed)) {
    goBackQuietly();
  }
}

function onPopState(event: PopStateEvent): void {
  const landed = entryOf(history.state);
  if (ownPops > 0) {
    ownPops--;
    event.stopImmediatePropagation();
    passOver(landed);
    if (ownPops === 0) {
      for (const entry of open) {
        if (entry.place === 'waiting') {
          pushState(entry);
        }
      }
    }
    return;
  }
  const top = open[open.length - 1];
  // An entry with no state at all is not one Back returns to: every entry the
  // router or an overlay made carries some. It is a new address (one typed, or
  // a plain `#` link), and the page that address names takes it.
  if (top?.place === 'pushed' && landed !== top.id && event.state !== null) {
    // Back has left the entry this overlay took: it is the overlay that goes, not the page.
    top.place = 'gone';
    open.pop();
    event.stopImmediatePropagation();
    top.close();
    passOver(landed);
    return;
  }
  // Back to a page the learner navigated away from with an overlay open: the
  // router takes this one, and the overlay's old entry under it is skipped.
  passOver(landed);
}

/**
 * Listens for Back ahead of every other `popstate` listener, which is why the
 * app calls this before it starts: listeners on the window run in the order
 * they were added, and the router's and a dialog's must not see a Back that
 * only closed an overlay.
 */
export function installOverlayHistory(): void {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('popstate', onPopState, { capture: true });
}

/** The history entry one open overlay takes, so that Back closes it. */
export class OverlayHistoryEntry {
  private entry: HistoryEntry | null = null;

  constructor(
    private readonly options: {
      /** Closes the overlay. */
      readonly close: () => void;
      /**
       * Whether a page navigation is already under way as it closes. Its entry
       * is then left for the new page to cover, because taking it off would
       * race the router and could undo the navigation.
       */
      readonly leaving?: () => boolean;
    },
  ) {}

  /** Called as the overlay opens. */
  start(): void {
    if (this.entry !== null && this.entry.place !== 'gone') {
      return;
    }
    if (typeof history.pushState !== 'function') {
      return;
    }
    installOverlayHistory();
    const entry: HistoryEntry = { id: ++sequence, place: 'waiting', close: this.options.close };
    // An entry still being taken off is not a place to stack another on: this
    // one goes on once that has settled.
    if (ownPops === 0) {
      pushState(entry);
    }
    open.push(entry);
    this.entry = entry;
  }

  /** Called once the overlay has closed, whichever way. */
  stop(): void {
    const entry = this.entry;
    this.entry = null;
    if (entry === null) {
      return;
    }
    const index = open.indexOf(entry);
    if (index >= 0) {
      open.splice(index, 1);
    }
    const pushed = entry.place === 'pushed';
    entry.place = 'gone';
    if (!pushed) {
      return;
    }
    if (entryOf(history.state) === entry.id && this.options.leaving?.() !== true) {
      goBackQuietly();
    } else {
      buried.add(entry.id);
    }
  }
}

/** Whether a click on `click` is the end of a press on `pressed`: the same element, or one inside the other. */
function sameGesture(pressed: Node, click: Node): boolean {
  const page = (node: Node): boolean => node === document.body || node === document.documentElement;
  if (pressed === click) {
    return true;
  }
  return (pressed.contains(click) && !page(pressed)) || (click.contains(pressed) && !page(click));
}

/** Back and a press outside, for a list that drops from a control. */
export class OpenOverlayGuard {
  private readonly history: OverlayHistoryEntry;
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
  ) {
    this.history = new OverlayHistoryEntry({ close: options.close });
  }

  /** Called as the list opens. */
  start(): void {
    this.history.start();
    document.addEventListener('pointerdown', this.onPress, { capture: true, passive: true });
  }

  /** Called once the list has closed. */
  stop(): void {
    document.removeEventListener('pointerdown', this.onPress, { capture: true });
    this.history.stop();
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
