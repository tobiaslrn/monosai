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
 *   own once that has settled, so one replacing another keeps Back.
 * - An entry no open overlay holds is never a place to stop. One that could
 *   not be taken off because a page sat on top of it, one left as a Forward
 *   step, and one an earlier load of the page left behind (a reload, or a tab
 *   the phone restored) are passed over, quietly, so Back never costs the
 *   learner a second press and Forward onto one changes nothing.
 * - The page's own writes to history (`writePageHistory`, the router's) land on
 *   the page's entry, never on an overlay's: they wait while this module is
 *   stepping back, and a page that replaces its address while an overlay's
 *   entry is on top first steps down to its own entry, so the address it
 *   replaces is not left under it for Back to return to.
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
/**
 * How long a step back may take before it is taken never to land. One always
 * does within a frame or two; this only keeps the page's writes from waiting
 * for ever on one a browser dropped.
 */
const STEP_TIMEOUT_MS = 1000;

interface HistoryEntry {
  readonly id: string;
  /** In history (`pushed`), or open and waiting for steps back to settle. */
  place: 'pushed' | 'waiting' | 'gone';
  readonly close: () => void;
}

/**
 * Part of every entry id, different on every load of the page, so an entry an
 * earlier load left in history is never taken for one this load pushed.
 */
const LOAD = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
/** The open overlays' entries, bottom first. */
const open: HistoryEntry[] = [];
let sequence = 0;
let installed = false;
/** Whether a step back this module asked for has yet to land; its `popstate` is not the learner's. */
let stepping = false;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
/** Whether the steps under way go on down to the page's own entry, past open overlays' too. */
let toPage = false;
/** The page's writes to history, held until the steps under way have landed. */
const held: (() => void)[] = [];
/** The address the learner was at, kept to tell whether passing over an entry moved them to another page. */
let lastHref = '';
/** The overlay entry the learner was on, if any, kept to tell a Back that leaves it. */
let lastEntry: string | null = null;
/** Where the learner was before they landed on an entry that is passed over; null when no such pass is under way. */
let passingFrom: string | null = null;
/** Set while a `popstate` this module sends on is being delivered. */
let relaying = false;

function entryOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const id = (state as Record<string, unknown>)[ENTRY_KEY];
  if (typeof id === 'string') {
    return id;
  }
  // Earlier versions numbered their entries from 1 on every load; such an id
  // never matches one this load pushes.
  return typeof id === 'number' ? String(id) : null;
}

function isOpen(id: string): boolean {
  return open.some((entry) => entry.id === id && entry.place === 'pushed');
}

/** A page state with this module's entry taken out, for a write that is the page's own. */
export function withoutOverlayEntry(state: unknown): unknown {
  if (typeof state !== 'object' || state === null || !(ENTRY_KEY in state)) {
    return state;
  }
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== ENTRY_KEY));
}

/** Notes where the learner is now that history has settled. */
function noteWhereWeAre(): void {
  lastHref = location.href;
  lastEntry = entryOf(history.state);
}

function pushState(entry: HistoryEntry): void {
  history.pushState({ ...((history.state as object | null) ?? {}), [ENTRY_KEY]: entry.id }, '');
  entry.place = 'pushed';
  lastEntry = entry.id;
}

/** Takes one entry off; its `popstate` is this module's, not the learner's. */
function stepBack(): void {
  const leaving = entryOf(history.state);
  if (toPage && leaving !== null) {
    // An open overlay stepped under takes its entry again once the steps settle.
    for (const entry of open) {
      if (entry.id === leaving && entry.place === 'pushed') {
        entry.place = 'waiting';
      }
    }
  }
  stepping = true;
  stepTimer = setTimeout(() => {
    stepTimer = null;
    stepping = false;
    settle();
  }, STEP_TIMEOUT_MS);
  history.back();
}

/** After a traversal: steps on past an entry that is no place to stop, or else lets what waited go ahead. */
function carryOn(landed: string | null): void {
  if (landed !== null && (toPage || !isOpen(landed))) {
    stepBack();
    return;
  }
  settle();
}

function settle(): void {
  toPage = false;
  for (const write of held.splice(0)) {
    write();
  }
  for (const entry of open) {
    if (entry.place === 'waiting') {
      pushState(entry);
    }
  }
  const from = passingFrom;
  passingFrom = null;
  noteWhereWeAre();
  // Passing over an entry Back landed on took the learner to another page, but
  // the router saw none of it: it is told where they are now.
  if (from !== null && from !== location.href) {
    relaying = true;
    try {
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state as unknown }));
    } finally {
      relaying = false;
    }
  }
}

function onPopState(event: PopStateEvent): void {
  if (relaying) {
    return;
  }
  const landed = entryOf(history.state);
  if (stepping) {
    stepping = false;
    if (stepTimer !== null) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
    event.stopImmediatePropagation();
    carryOn(landed);
    return;
  }
  const top = open[open.length - 1];
  // An entry with no state at all is not one Back returns to: every entry the
  // router or an overlay made carries some. It is a new address (one typed, or
  // a plain `#` link), and the page that address names takes it.
  if (
    top?.place === 'pushed' &&
    lastEntry === top.id &&
    landed !== top.id &&
    event.state !== null
  ) {
    // Back has left the entry this overlay took: it is the overlay that goes, not the page.
    top.place = 'gone';
    open.pop();
    event.stopImmediatePropagation();
    top.close();
    carryOn(landed);
    return;
  }
  if (landed !== null && !isOpen(landed)) {
    // An entry no open overlay holds: the learner goes on past it, and the
    // page hears only where they end up.
    event.stopImmediatePropagation();
    passingFrom = lastHref;
    stepBack();
    return;
  }
  noteWhereWeAre();
}

/**
 * Listens for Back ahead of every other `popstate` listener, which is why the
 * app calls this before it starts: listeners on the window run in the order
 * they were added, and the router's and a dialog's must not see a Back that
 * only closed an overlay. A page that loads on an overlay's entry (a reload, or
 * a tab the phone restored, with an overlay open) steps down to its own.
 */
export function installOverlayHistory(): void {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('popstate', onPopState, { capture: true });
  noteWhereWeAre();
  if (entryOf(history.state) !== null) {
    toPage = true;
    stepBack();
  }
}

/**
 * Makes one of the page's own writes to history: the router's push or replace
 * of its address. It waits while this module is stepping back. A replace while
 * an overlay's entry is on top steps down to the page's entry and replaces that
 * one; an overlay still open takes its entry again on top of it.
 */
export function writePageHistory(replacing: boolean, write: () => void): void {
  if (replacing && entryOf(history.state) !== null) {
    toPage = true;
    if (!stepping) {
      stepBack();
    }
  }
  if (stepping) {
    held.push(write);
    return;
  }
  write();
  noteWhereWeAre();
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
       * is then left for the new page to cover, and Back passes over it.
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
    sequence += 1;
    const entry: HistoryEntry = {
      id: `${LOAD}:${String(sequence)}`,
      place: 'waiting',
      close: this.options.close,
    };
    // An entry still being taken off is not a place to stack another on: this
    // one goes on once that has settled.
    if (!stepping) {
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
    // Left where it is, an entry is passed over when Back or Forward reaches it.
    if (
      pushed &&
      !stepping &&
      entryOf(history.state) === entry.id &&
      this.options.leaving?.() !== true
    ) {
      stepBack();
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
