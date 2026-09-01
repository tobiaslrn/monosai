import { Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

const ORIGIN_STATE_KEY = 'monosaiNavigationOrigin';
const SAFE_ORIGIN = /^\/(?:library|settings|generate|add|vocabulary|grammar|reader\/[\w-]+)$/;

export type NavigationOriginState = Readonly<Record<typeof ORIGIN_STATE_KEY, string>>;

/** State attached to an in-app link so its destination can safely pop back. */
export function navigationOriginState(originUrl: string): NavigationOriginState {
  if (!SAFE_ORIGIN.test(originUrl)) {
    throw new Error(`Unsafe navigation origin: ${originUrl}`);
  }
  return { [ORIGIN_STATE_KEY]: originUrl };
}

/** Reads only internal origins written by `navigationOriginState`. */
export function readNavigationOrigin(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const origin = (state as Record<string, unknown>)[ORIGIN_STATE_KEY];
  return typeof origin === 'string' && SAFE_ORIGIN.test(origin) ? origin : null;
}

/**
 * Makes an in-app Back control agree with browser Back without letting a deep
 * link pop out to an unrelated site or app.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  currentOrigin(): string | null {
    return readNavigationOrigin(globalThis.history.state);
  }

  canPopTo(targetUrl: string): boolean {
    return this.currentOrigin() === targetUrl;
  }

  /** Keeps a proven origin through a replace transition; deep links stay unmarked. */
  preservedOriginState(expectedOrigin: string): NavigationOriginState | undefined {
    return this.canPopTo(expectedOrigin) ? navigationOriginState(expectedOrigin) : undefined;
  }

  async backOrNavigate(fallbackUrl: string): Promise<void> {
    if (this.canPopTo(fallbackUrl)) {
      this.location.back();
      return;
    }
    await this.router.navigateByUrl(fallbackUrl);
  }
}
