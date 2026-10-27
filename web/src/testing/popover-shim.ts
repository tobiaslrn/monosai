/**
 * The part of the native popover API that jsdom lacks, for the components that
 * lean on it: `showPopover`, `hidePopover`, the `beforetoggle` and `toggle`
 * events, `:popover-open`, a `popovertarget` invoker, light dismiss on a press
 * outside, Escape, and focus returning to what had it. It stands in for the
 * browser so a component's own wiring can be exercised; what the browser itself
 * does is covered by the Playwright journeys.
 *
 * As in the browser, focus returns on Escape and on `hidePopover()`, but not on
 * a light dismiss: a press outside has already put focus where the learner
 * pointed.
 */
interface OpenPopover {
  readonly element: HTMLElement;
  readonly previousFocus: Element | null;
}

export function installPopoverShim(): () => void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const elementProto = Element.prototype;
  const original = {
    showPopover: proto['showPopover'],
    hidePopover: proto['hidePopover'],
    togglePopover: proto['togglePopover'],
  };
  // Kept to be restored and called with the element it was asked about.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalMatches = elementProto.matches;
  const open: OpenPopover[] = [];

  function announce(element: HTMLElement, type: string, oldState: string, newState: string): void {
    element.dispatchEvent(Object.assign(new Event(type), { oldState, newState }));
  }

  function show(this: HTMLElement): void {
    if (open.some((entry) => entry.element === this)) {
      return;
    }
    announce(this, 'beforetoggle', 'closed', 'open');
    open.push({ element: this, previousFocus: document.activeElement });
    announce(this, 'toggle', 'closed', 'open');
  }

  function close(element: HTMLElement, restoreFocus: boolean): void {
    const index = open.findIndex((entry) => entry.element === element);
    if (index < 0) {
      return;
    }
    announce(element, 'beforetoggle', 'open', 'closed');
    const [entry] = open.splice(index, 1);
    announce(element, 'toggle', 'open', 'closed');
    if (
      restoreFocus &&
      entry!.previousFocus instanceof HTMLElement &&
      entry!.previousFocus.isConnected
    ) {
      entry!.previousFocus.focus();
    }
  }

  function hide(this: HTMLElement): void {
    close(this, true);
  }

  function toggle(this: HTMLElement): void {
    if (open.some((entry) => entry.element === this)) {
      hide.call(this);
    } else {
      show.call(this);
    }
  }

  proto['showPopover'] = show;
  proto['hidePopover'] = hide;
  proto['togglePopover'] = toggle;
  elementProto.matches = function (this: Element, selector: string): boolean {
    if (selector === ':popover-open') {
      return open.some((entry) => entry.element === this);
    }
    return originalMatches.call(this, selector);
  } as typeof originalMatches;

  const onClick = (event: Event): void => {
    const invoker = (event.target as Element | null)?.closest('[popovertarget]');
    const target = invoker?.getAttribute('popovertarget');
    if (invoker !== null && invoker !== undefined && target !== null && target !== undefined) {
      document.getElementById(target)?.togglePopover();
    }
  };
  const onPointerDown = (event: Event): void => {
    const target = event.target as Element | null;
    for (const entry of [...open]) {
      const invoker = document.querySelector(`[popovertarget="${entry.element.id}"]`);
      if (!entry.element.contains(target) && !(invoker?.contains(target) ?? false)) {
        close(entry.element, false);
      }
    }
  };
  const onKeydown = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') {
      open.at(-1)?.element.hidePopover();
    }
  };
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeydown);

  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeydown);
    proto['showPopover'] = original.showPopover;
    proto['hidePopover'] = original.hidePopover;
    proto['togglePopover'] = original.togglePopover;
    elementProto.matches = originalMatches;
  };
}
