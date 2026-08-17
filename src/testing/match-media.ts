/**
 * Installs a deterministic `matchMedia` in jsdom so viewport-dependent
 * components can be tested at desktop and mobile widths.
 */
export interface FakeMediaMatcher {
  setWidth(widthPx: number): void;
  restore(): void;
}

interface ManagedList {
  query: string;
  list: MediaQueryList;
  listeners: ((event: MediaQueryListEvent) => void)[];
}

function evaluate(query: string, widthPx: number, prefersDark: boolean): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) {
    return widthPx >= Number(min[1]);
  }
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (max) {
    return widthPx <= Number(max[1]);
  }
  if (query.includes('prefers-color-scheme: dark')) {
    return prefersDark;
  }
  return false;
}

export function installFakeMatchMedia(
  initialWidthPx = 1280,
  prefersDark = false,
): FakeMediaMatcher {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const managed: ManagedList[] = [];
  let width = initialWidthPx;

  window.matchMedia = (query: string): MediaQueryList => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    const list = {
      media: query,
      matches: evaluate(query, width, prefersDark),
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    managed.push({ query, list, listeners });
    return list;
  };

  return {
    setWidth(nextWidthPx: number): void {
      width = nextWidthPx;
      for (const entry of managed) {
        const matches = evaluate(entry.query, width, prefersDark);
        Object.defineProperty(entry.list, 'matches', { value: matches, configurable: true });
        for (const listener of entry.listeners) {
          listener({ matches, media: entry.query } as MediaQueryListEvent);
        }
      }
    },
    restore(): void {
      if (originalDescriptor) {
        Object.defineProperty(window, 'matchMedia', originalDescriptor);
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    },
  };
}
