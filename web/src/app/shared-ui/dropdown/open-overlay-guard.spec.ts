import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { OpenOverlayGuard } from './open-overlay-guard';

/**
 * What every dropdown and menu owes the page while it is open: Back closes the
 * list rather than leaving the page, and a press outside only closes it.
 *
 * The browser's own traversal is replaced: `history.back()` does nothing here,
 * and a step back is a `popstate` dispatched by hand, so no test waits on
 * jsdom's history or leaves a step pending for the next one.
 */
describe('OpenOverlayGuard', () => {
  let panel: HTMLElement;
  let trigger: HTMLButtonElement;
  let outside: HTMLButtonElement;
  let close: Mock<() => void>;
  let back: Mock<() => void>;
  let guard: OpenOverlayGuard;

  beforeEach(() => {
    panel = document.createElement('div');
    trigger = document.createElement('button');
    outside = document.createElement('button');
    document.body.append(trigger, panel, outside);
    close = vi.fn<() => void>();
    back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    guard = new OpenOverlayGuard({ panel, trigger: () => trigger, close });
  });

  afterEach(() => {
    const stepsBack = back.mock.calls.length;
    guard.stop();
    if (back.mock.calls.length > stepsBack) {
      // The step the guard took itself, arriving as the browser would deliver it.
      pressBack();
    }
    history.replaceState(null, '');
    panel.remove();
    trigger.remove();
    outside.remove();
    vi.restoreAllMocks();
  });

  /** Back as the browser reports it: the entry the list took is no longer current. */
  function pressBack(): void {
    history.replaceState(null, '');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }

  it('takes one history entry while the list is open', () => {
    guard.start();

    expect((history.state as Record<string, unknown>)['monosaiOverlayEntry']).toEqual(
      expect.any(Number),
    );
  });

  it('closes the list on Back, and nothing behind it sees that Back', () => {
    const seenByThePage = vi.fn();
    guard.start();
    window.addEventListener('popstate', seenByThePage);

    pressBack();
    window.removeEventListener('popstate', seenByThePage);

    expect(close).toHaveBeenCalledTimes(1);
    expect(seenByThePage).not.toHaveBeenCalled();
  });

  it('takes its entry back off when the list closes another way, and swallows that step', () => {
    guard.start();

    guard.stop();
    expect(back).toHaveBeenCalledTimes(1);

    const seenByThePage = vi.fn();
    window.addEventListener('popstate', seenByThePage);
    pressBack();
    window.removeEventListener('popstate', seenByThePage);

    expect(seenByThePage).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('stops the click that ends a press outside, so it activates nothing', () => {
    const activated = vi.fn();
    outside.addEventListener('click', activated);
    guard.start();

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    outside.click();

    expect(activated).not.toHaveBeenCalled();
  });

  it('leaves a press inside the list and on its own trigger alone', () => {
    const chosen = vi.fn();
    const toggled = vi.fn();
    panel.addEventListener('click', chosen);
    trigger.addEventListener('click', toggled);
    guard.start();

    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    panel.click();
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.click();

    expect(chosen).toHaveBeenCalledTimes(1);
    expect(toggled).toHaveBeenCalledTimes(1);
  });
});
