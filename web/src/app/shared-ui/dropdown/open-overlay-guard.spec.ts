import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installOverlayHistory, OverlayHistoryEntry, writePageHistory } from './open-overlay-guard';

/**
 * Waits until every traversal asked for so far has landed. A `popstate` the
 * module swallows reaches no listener a test could add, so it is waited out.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Back, as the browser's button or the Android gesture gives it. */
async function back(): Promise<void> {
  history.back();
  await settle();
}

function overlayEntry(): unknown {
  return (history.state as Record<string, unknown> | null)?.['monosaiOverlayEntry'];
}

/**
 * The current entry's state without where it sits, which entries carry for a
 * browser without the Navigation API (jsdom has none).
 */
function pageState(): unknown {
  const state = history.state as Record<string, unknown> | null;
  if (state === null) {
    return state;
  }
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'monosaiHistoryIndex'));
}

/** The router's push of a new address. */
function openPage(page: string): void {
  writePageHistory(false, () => {
    history.pushState({ page }, '', `#/${page}`);
  });
}

describe('OverlayHistoryEntry', () => {
  /** What the router would see: every `popstate` the module lets through. */
  const pageSaw = vi.fn();

  beforeEach(async () => {
    installOverlayHistory();
    window.addEventListener('popstate', pageSaw);
    history.pushState({ page: 'reader' }, '', '#/reader');
    await settle();
    pageSaw.mockClear();
  });

  afterEach(() => {
    window.removeEventListener('popstate', pageSaw);
  });

  it('closes the overlay on Back without the page seeing it', async () => {
    const close = vi.fn();
    const entry = new OverlayHistoryEntry({ close });
    entry.start();
    expect(overlayEntry()).toEqual(expect.any(String));

    await back();
    entry.stop();

    expect(close).toHaveBeenCalledOnce();
    expect(pageSaw).not.toHaveBeenCalled();
    expect(history.state).toEqual({ page: 'reader' });
  });

  it('takes its entry back off when it closes another way', async () => {
    const entry = new OverlayHistoryEntry({ close: vi.fn() });
    entry.start();

    entry.stop();
    await settle();

    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).not.toHaveBeenCalled();
  });

  it('gives an overlay that replaces another its own entry once the old one is off', async () => {
    const first = new OverlayHistoryEntry({ close: vi.fn() });
    const closeSecond = vi.fn();
    const second = new OverlayHistoryEntry({ close: closeSecond });
    first.start();

    first.stop();
    second.start();
    await settle();
    expect(overlayEntry()).toEqual(expect.any(String));

    await back();

    expect(closeSecond).toHaveBeenCalledOnce();
    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).not.toHaveBeenCalled();
  });

  it('lets a new address through to the page while it is open', async () => {
    const close = vi.fn();
    const entry = new OverlayHistoryEntry({ close });
    entry.start();

    // What the browser does for a new `#` address: a fresh entry with no state,
    // and a `popstate` for it (Chromium fires one; jsdom does not, so it is sent here).
    history.pushState(null, '', '#/library');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await settle();

    expect(pageSaw).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/library');
    entry.stop();
  });

  it('gives its entry up to a page opened from inside it, so Back and Forward each take one press', async () => {
    const entry = new OverlayHistoryEntry({ close: vi.fn() });
    entry.start();

    // A link inside the overlay: the router pushes the new page, then the old page goes.
    openPage('settings');
    entry.stop();
    await settle();
    expect(pageState()).toEqual({ page: 'settings' });

    await back();
    expect(location.hash).toBe('#/reader');
    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).toHaveBeenCalledOnce();

    history.forward();
    await settle();
    expect(location.hash).toBe('#/settings');
    expect(pageState()).toEqual({ page: 'settings' });
    expect(pageSaw).toHaveBeenCalledTimes(2);
  });

  it('gives its entry up to a page opened after it began to close', async () => {
    const entry = new OverlayHistoryEntry({ close: vi.fn() });
    entry.start();

    // The overlay closes first and its entry is still coming off as the router pushes.
    entry.stop();
    openPage('settings');
    await settle();
    expect(pageState()).toEqual({ page: 'settings' });

    await back();
    expect(history.state).toEqual({ page: 'reader' });
    history.forward();
    await settle();
    expect(location.hash).toBe('#/settings');
    expect(pageSaw).toHaveBeenCalledTimes(2);
  });

  it('passes over an entry an earlier load left between two pages the way the learner went', async () => {
    // A reader, an entry a sheet left there before a reload, and the page that sheet led to.
    const push = (state: Record<string, unknown>, hash: string): void => {
      history.pushState(state, '', hash);
      history.replaceState({ ...state, monosaiHistoryIndex: history.length - 1 }, '', hash);
    };
    push({ page: 'reader' }, '#/reader');
    push({ page: 'reader', monosaiOverlayEntry: 'earlier-load:1' }, '#/reader');
    push({ page: 'settings' }, '#/settings');
    // The router's own write as it settles on the page.
    writePageHistory(true, () => {
      history.replaceState({ page: 'settings' }, '', '#/settings');
    });

    await back();
    expect(location.hash).toBe('#/reader');
    expect(pageState()).toEqual({ page: 'reader' });
    expect(pageSaw).toHaveBeenCalledOnce();

    history.forward();
    await settle();
    expect(location.hash).toBe('#/settings');
    expect(pageState()).toEqual({ page: 'settings' });
    expect(pageSaw).toHaveBeenCalledTimes(2);
  });

  it('passes over an entry a closed overlay left, so Forward onto it changes nothing', async () => {
    const entry = new OverlayHistoryEntry({ close: vi.fn() });
    entry.start();
    entry.stop();
    await settle();

    history.forward();
    await settle();

    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).not.toHaveBeenCalled();
  });

  it('passes over an entry an earlier load of the page left, so one Back closes an overlay', async () => {
    // Left by a load before a reload, numbered the way earlier versions did.
    history.pushState({ page: 'reader', monosaiOverlayEntry: 1 }, '');
    history.pushState({ page: 'reader', monosaiOverlayEntry: 'earlier-load:1' }, '');
    const close = vi.fn();
    const entry = new OverlayHistoryEntry({ close });
    entry.start();
    expect(overlayEntry()).not.toBe('earlier-load:1');

    await back();

    expect(close).toHaveBeenCalledOnce();
    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).not.toHaveBeenCalled();
    entry.stop();
  });

  it("replaces the page's own entry when the page replaces its address under an open overlay", async () => {
    writePageHistory(false, () => {
      history.pushState({ page: 'gone' }, '', '#/reader/gone');
    });
    const entry = new OverlayHistoryEntry({ close: vi.fn() });
    entry.start();

    // The router replacing the address, then taking the overlay down with the page.
    writePageHistory(true, () => {
      history.replaceState({ page: 'library' }, '', '#/library');
    });
    entry.stop();
    await settle();
    expect(pageState()).toEqual({ page: 'library' });
    expect(location.hash).toBe('#/library');

    // The replaced address is not under it, and the overlay's old entry is no step forward.
    history.forward();
    await settle();
    expect(location.hash).toBe('#/library');
    await back();
    expect(location.hash).toBe('#/reader');
    expect(history.state).toEqual({ page: 'reader' });
    expect(pageSaw).toHaveBeenCalledOnce();
  });

  it('gives an overlay still open after the page replaced its address its entry back on top', async () => {
    const close = vi.fn();
    const entry = new OverlayHistoryEntry({ close });
    entry.start();

    writePageHistory(true, () => {
      history.replaceState({ page: 'reader', query: 'cleared' }, '', '#/reader?cleared');
    });
    await settle();
    expect(overlayEntry()).toEqual(expect.any(String));

    await back();

    expect(close).toHaveBeenCalledOnce();
    expect(history.state).toEqual({ page: 'reader', query: 'cleared' });
    expect(pageSaw).not.toHaveBeenCalled();
  });
});
