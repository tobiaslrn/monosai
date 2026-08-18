import { inject, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, type ActivatedRoute } from '@angular/router';

/**
 * How much application chrome a route wants around it.
 *
 * `focused` is for the reader, which supplies its own header and hides the
 * bottom navigation so the Japanese stays the primary thing on a phone screen.
 */
export type RouteChrome = 'default' | 'focused';

export interface RouteChromeData {
  readonly chrome?: RouteChrome;
}

function deepestChild(route: ActivatedRoute): ActivatedRoute {
  let current = route;
  while (current.firstChild !== null) {
    current = current.firstChild;
  }
  return current;
}

/** Tracks the active route's chrome preference. */
export function routeChromeSignal(): Signal<RouteChrome> {
  const router = inject(Router);
  const chrome = signal<RouteChrome>('default');

  const read = (): void => {
    const data: RouteChromeData = deepestChild(router.routerState.root).snapshot.data;
    chrome.set(data.chrome ?? 'default');
  };

  read();
  router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
    if (event instanceof NavigationEnd) {
      read();
    }
  });

  return chrome.asReadonly();
}
