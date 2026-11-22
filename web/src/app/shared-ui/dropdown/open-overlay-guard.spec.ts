import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installOverlayHistory, OverlayHistoryEntry } from './open-overlay-guard';

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
    expect(overlayEntry()).toEqual(expect.any(Number));

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
    expect(overlayEntry()).toEqual(expect.any(Number));

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
    history.pushState({ page: 'settings' }, '', '#/settings');
    await settle();

    await back();

    // The page saw the Back to the reader, and the overlay's old entry was skipped.
    expect(pageSaw).toHaveBeenCalledOnce();
    expect(history.state).toEqual({ page: 'reader' });
    expect(location.hash).toBe('#/reader');
  });
});
