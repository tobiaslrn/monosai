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
 * - The page's own writes to history (`writePageHistory`, the router's) land on
 *   the page's entry, never on an overlay's, and never on top of one: they wait
 *   while this module is stepping back, and a page that pushes or replaces its
 *   address while an overlay's entry is on top first steps down to its own
 *   entry. A link inside a sheet so leaves no overlay entry under the page it
 *   opens, for Back or Forward to meet, and a replaced address is not left
 *   under its replacement for Back to return to.
 * - An entry no open overlay holds is never a place to stop. One left as a
 *   Forward step and one an earlier load of the page left behind (a reload, or
 *   a tab the phone restored) are passed over, quietly, in the direction the
 *   learner went: Back goes on back and Forward goes on forward, and Forward
 *   with nothing further returns to the page it came from. Neither ever costs
 *   the learner a second press.
 * - A press outside a list that drops from a control only closes it
 *   (`OpenOverlayGuard`). The press that dismisses a native popover still
 *   goes on to click whatever was under it; the click that follows is
 *   stopped, so tapping away never also activates the row, link, or button
 *   beneath.
 *
 * One instance per overlay; it listens only while the overlay is open.
 */
const ENTRY_KEY = 'monosaiOverlayEntry';
/**
 * Where an entry sits in the tab's history, kept in the entries this app writes
 * for a browser without the Navigation API, which would otherwise not say.
 */
const INDEX_KEY = 'monosaiHistoryIndex';
/** How long after a dismissing press a click can still be the same gesture's. */
const CLICK_WINDOW_MS = 600;
/**
 * How long a step may take before it is taken never to land. One always does
 * within a frame or two; this only keeps the page's writes from waiting for
 * ever on one a browser dropped.
 */
const STEP_TIMEOUT_MS = 1000;

interface HistoryEntry {
  readonly id: string;
  /** In history (`pushed`), or open and waiting for steps back to settle. */
  place: 'pushed' | 'waiting' | 'gone';
  readonly close: () => void;
}

/** The part of the Navigation API read here; not every browser has it. */
interface NavigationHistory {
  readonly currentEntry: { readonly index: number } | null;
  readonly canGoForward: boolean;
}

/**
 * Part of every entry id, different on every load of the page, so an entry an
 * earlier load left in history is never taken for one this load pushed. Drawn
 * from crypto rather than Math.random, so loading this module takes nothing
 * from a sequence a screenshot run seeds to pin what is drawn by chance.
 */
const LOAD = crypto.randomUUID();
/** The open overlays' entries, bottom first. */
const open: HistoryEntry[] = [];
let sequence = 0;
let installed = false;
/** Whether a step this module asked for has yet to land; its `popstate` is not the learner's. */
let stepping = false;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
/** Whether the steps under way go on down to the page's own entry, past open overlays' too. */
let toPage = false;
/** Which way the steps under way go: the way the learner went when passing over an entry. */
let heading: 'back' | 'forward' = 'back';
/** The page's writes to history, held until the steps under way have landed. */
const held: (() => void)[] = [];
/** The address the learner was at, kept to tell whether passing over an entry moved them to another page. */
let lastHref = '';
/** The overlay entry the learner was on, if any, kept to tell a Back that leaves it. */
let lastEntry: string | null = null;
/** Where in the tab's history the learner was, if that can be told, kept to tell Back from Forward. */
let lastIndex: number | null = null;
/** Where the learner was before they landed on an entry that is passed over; null when no such pass is under way. */
let passingFrom: string | null = null;
/** Set while a `popstate` this module sends on is being delivered. */
let relaying = false;

function fieldOf(state: unknown, key: string): unknown {
  return typeof state === 'object' && state !== null
    ? (state as Record<string, unknown>)[key]
    : undefined;
}

function entryOf(state: unknown): string | null {
  const id = fieldOf(state, ENTRY_KEY);
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

/** The Navigation API's view of where the tab is, where the browser has one. */
function navigationHistory(): { readonly index: number; readonly canGoForward: boolean } | null {
  const navigation = (window as unknown as { navigation?: NavigationHistory }).navigation;
  const index = navigation?.currentEntry?.index;
  if (navigation === undefined || typeof index !== 'number' || index < 0) {
    return null;
  }
  return { index, canGoForward: navigation.canGoForward };
}

/** Where the current entry sits in the tab's history, or null when that cannot be told. */
function indexHere(): number | null {
  const navigation = navigationHistory();
  if (navigation !== null) {
    return navigation.index;
  }
  const index = fieldOf(history.state, INDEX_KEY);
  return typeof index === 'number' ? index : null;
}

/** Whether there is an entry after the current one. */
function canGoForward(): boolean {
  const navigation = navigationHistory();
  if (navigation !== null) {
    return navigation.canGoForward;
  }
  const here = indexHere();
  return here !== null && here < history.length - 1;
}

/**
 * Writes where the entry just written sits into it, for a browser without the
 * Navigation API. A pushed entry is the last one; a replaced entry stays where
 * the one it replaced was.
 */
function markIndex(replacing: boolean, before: number | null): void {
  if (navigationHistory() !== null) {
    return;
  }
  const index = replacing ? before : history.length - 1;
  if (index === null || fieldOf(history.state, INDEX_KEY) === index) {
    return;
  }
  history.replaceState({ ...((history.state as object | null) ?? {}), [INDEX_KEY]: index }, '');
}

/** Notes where the learner is now that history has settled. */
function noteWhereWeAre(): void {
  lastHref = location.href;
  lastEntry = entryOf(history.state);
  lastIndex = indexHere();
}

function pushState(entry: HistoryEntry): void {
  history.pushState({ ...((history.state as object | null) ?? {}), [ENTRY_KEY]: entry.id }, '');
  markIndex(false, null);
  entry.place = 'pushed';
  lastEntry = entry.id;
  lastIndex = indexHere();
}

/** Takes one entry off, back towards the page's own. */
function stepBack(): void {
  heading = 'back';
  step();
}

/**
 * Moves one entry the way the steps under way go; its `popstate` is this
 * module's, not the learner's. Forward with no entry further on turns back.
 */
function step(): void {
  if (toPage || (heading === 'forward' && !canGoForward())) {
    heading = 'back';
  }
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
  if (heading === 'forward') {
    history.forward();
  } else {
    history.back();
  }
}

/** After a traversal: steps on past an entry that is no place to stop, or else lets what waited go ahead. */
function carryOn(landed: string | null): void {
  if (landed !== null && (toPage || !isOpen(landed))) {
    step();
    return;
  }
  settle();
}

function settle(): void {
  toPage = false;
  heading = 'back';
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
  // Passing over an entry Back or Forward landed on took the learner to another
  // page, but the router saw none of it: it is told where they are now.
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
  const index = indexHere();
  // Told apart by where the entries sit; when that cannot be told, it is taken for Back.
  const forward = index !== null && lastIndex !== null && index > lastIndex;
  const top = open[open.length - 1];
  // An entry with no state at all is not one Back returns to: every entry the
  // router or an overlay made carries some. It is a new address (one typed, or
  // a plain `#` link), and the page that address names takes it.
  if (
    top?.place === 'pushed' &&
    lastEntry === top.id &&
    landed !== top.id &&
    !forward &&
    event.state !== null
  ) {
    // Back has left the entry this overlay took: it is the overlay that goes, not the page.
    top.place = 'gone';
    open.pop();
    event.stopImmediatePropagation();
    top.close();
    heading = 'back';
    carryOn(landed);
    return;
  }
  if (landed !== null && !isOpen(landed)) {
    // An entry no open overlay holds: the learner goes on past it, the way
    // they went, and the page hears only where they end up.
    event.stopImmediatePropagation();
    passingFrom = lastHref;
    heading = forward ? 'forward' : 'back';
    step();
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
 * of its address. It waits while this module is stepping. A push or replace
 * while an overlay's entry is on top steps down to the page's entry first, so
 * the overlay's entry is taken off rather than buried under the next page or
 * replaced in place of the page's own; an overlay still open takes its entry
 * again on top.
 */
export function writePageHistory(replacing: boolean, write: () => void): void {
  if (entryOf(history.state) !== null) {
    toPage = true;
    if (!stepping) {
      stepBack();
    }
  }
  const done = (): void => {
    const before = indexHere();
    write();
    markIndex(replacing, before);
    noteWhereWeAre();
  };
  if (stepping) {
    held.push(done);
    return;
  }
  done();
}

/** The history entry one open overlay takes, so that Back closes it. */
export class OverlayHistoryEntry {
  private entry: HistoryEntry | null = null;

  constructor(
    private readonly options: {
      /** Closes the overlay. */
      readonly close: () => void;
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

  /**
   * Called once the overlay has closed, whichever way. Its entry comes off,
   * unless a page has already been written over it, which took it off itself.
   */
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
    if (pushed && !stepping && entryOf(history.state) === entry.id) {
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
