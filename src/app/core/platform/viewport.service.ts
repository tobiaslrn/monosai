import { Injectable, computed } from '@angular/core';
import { mediaQuerySignal } from './media-query';

/** Breakpoint at which the persistent desktop sidebar replaces bottom navigation. */
export const DESKTOP_BREAKPOINT_PX = 960;

/** Breakpoint below which the desktop sidebar collapses to icons with accessible names. */
export const COMPACT_SIDEBAR_BREAKPOINT_PX = 1120;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly desktop = mediaQuerySignal(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
  private readonly wide = mediaQuerySignal(`(min-width: ${COMPACT_SIDEBAR_BREAKPOINT_PX}px)`);
  private readonly reducedMotion = mediaQuerySignal('(prefers-reduced-motion: reduce)');

  readonly isDesktop = this.desktop;
  readonly isMobile = computed(() => !this.desktop());
  readonly isSidebarCompact = computed(() => this.desktop() && !this.wide());
  readonly prefersReducedMotion = this.reducedMotion;
}
