import { Injectable, computed } from '@angular/core';
import { mediaQuerySignal } from './media-query';

/** Breakpoint at which floating surfaces anchor to their origin instead of docking as sheets. */
export const DESKTOP_BREAKPOINT_EM = 60;

/** Breakpoint below which a docked surface spans the viewport as a full-width sheet. */
export const NARROW_BREAKPOINT_EM = 32;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly desktop = mediaQuerySignal(`(min-width: ${DESKTOP_BREAKPOINT_EM}em)`);
  private readonly narrow = mediaQuerySignal(`(max-width: ${NARROW_BREAKPOINT_EM - 0.001}em)`);
  private readonly reducedMotion = mediaQuerySignal('(prefers-reduced-motion: reduce)');

  readonly isDesktop = this.desktop;
  readonly isMobile = computed(() => !this.desktop());
  /** True while a docked surface is presented as a full-width bottom sheet. */
  readonly isNarrow = this.narrow;
  readonly prefersReducedMotion = this.reducedMotion;
}
