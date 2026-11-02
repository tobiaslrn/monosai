import { Injectable, computed } from '@angular/core';
import { mediaQuerySignal } from './media-query';

/** Breakpoint at which floating surfaces anchor to their origin instead of docking as sheets. */
export const DESKTOP_BREAKPOINT_EM = 60;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly desktop = mediaQuerySignal(`(min-width: ${DESKTOP_BREAKPOINT_EM}em)`);
  private readonly reducedMotion = mediaQuerySignal('(prefers-reduced-motion: reduce)');

  readonly isDesktop = this.desktop;
  readonly isMobile = computed(() => !this.desktop());
  readonly prefersReducedMotion = this.reducedMotion;
}
