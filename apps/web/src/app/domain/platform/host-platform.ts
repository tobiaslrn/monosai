import { InjectionToken } from '@angular/core';

/**
 * Which kind of device Monosai is running on.
 *
 * Only ever used to decide how Anki is reached and what to say when it cannot
 * be: a desktop browser talks to the AnkiConnect add-on, Android talks to the
 * Monosai bridge, and iOS can talk to neither. Nothing else branches on it, and
 * nothing here changes layout — that is what media queries are for.
 */
export type HostPlatform = 'desktop' | 'android' | 'ios';

/**
 * A port rather than a `navigator` read at the point of use, so a test can pin
 * the platform without pretending to be a browser.
 */
export const HOST_PLATFORM = new InjectionToken<HostPlatform>('monosai.host-platform');

/** What the detection needs from the browser, and nothing more. */
export interface HostPlatformSignals {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

/**
 * Classifies the host from what the browser admits to.
 *
 * User-agent sniffing is the wrong tool for capabilities and the only tool for
 * this one: whether a local Anki can be reached at all is a property of the
 * operating system, not of any API the page can feature-detect. iPadOS reports
 * itself as a Macintosh, so a Mac claiming several touch points is treated as
 * an iPad — the alternative is offering an iPad a connection that can never
 * succeed.
 */
export function detectHostPlatform(signals: HostPlatformSignals): HostPlatform {
  const agent = signals.userAgent;
  if (/android/i.test(agent)) {
    return 'android';
  }
  if (/iphone|ipad|ipod/i.test(agent)) {
    return 'ios';
  }
  if (/macintosh/i.test(agent) && signals.maxTouchPoints > 1) {
    return 'ios';
  }
  return 'desktop';
}
