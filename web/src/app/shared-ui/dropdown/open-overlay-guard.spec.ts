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

  it('leaves its entry to a page it is leaving for, and Back passes over it', async () => {
    const entry = new OverlayHistoryEntry({ close: vi.fn(), leaving: () => true });
    entry.start();

    entry.stop();
    writePageHistory(false, () => {
      history.pushState({ page: 'settings' }, '', '#/settings');
    });
    await settle();

    await back();

    // The page saw the Back to the reader, and the overlay's old entry was skipped.
    expect(pageSaw).toHaveBeenCalledOnce();
    expect(history.state).toEqual({ page: 'reader' });
    expect(location.hash).toBe('#/reader');
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
    expect(history.state).toEqual({ page: 'library' });
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
