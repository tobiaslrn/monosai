import { DOCUMENT, inject, signal, type Signal } from '@angular/core';

/**
 * Creates a signal tracking a CSS media query. Falls back to `false` in
 * environments without `matchMedia` (server-less prerender, older test hosts).
 */
export function mediaQuerySignal(query: string): Signal<boolean> {
  const view = inject(DOCUMENT).defaultView;
  if (!view?.matchMedia) {
    return signal(false).asReadonly();
  }

  const list = view.matchMedia(query);
  const matches = signal(list.matches);
  list.addEventListener('change', (event) => {
    matches.set(event.matches);
  });
  return matches.asReadonly();
}
