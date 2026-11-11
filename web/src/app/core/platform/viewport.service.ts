import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { mediaQuerySignal } from './media-query';

/** Breakpoint at which floating surfaces anchor to their origin instead of docking as sheets. */
export const DESKTOP_BREAKPOINT_EM = 60;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly desktop = mediaQuerySignal(`(min-width: ${DESKTOP_BREAKPOINT_EM}em)`);
  private readonly reducedMotion = mediaQuerySignal('(prefers-reduced-motion: reduce)');
  private readonly keyboard = signal(0);
  private readonly visible = signal<number | null>(null);

  readonly isDesktop = this.desktop;
  readonly isMobile = computed(() => !this.desktop());
  readonly prefersReducedMotion = this.reducedMotion;
  /**
   * How much of the layout viewport's bottom the on-screen keyboard covers, in
   * pixels. A bottom sheet lifts by this much so it stays above the keyboard.
   */
  readonly keyboardInset = this.keyboard.asReadonly();
  /** The height of what the learner can see, in pixels; null where it cannot be measured. */
  readonly visibleHeight = this.visible.asReadonly();

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    const visual = view?.visualViewport;
    if (!view || !visual) {
      return;
    }
    const measure = (): void => {
      this.keyboard.set(
        Math.max(0, Math.round(view.innerHeight - visual.height - visual.offsetTop)),
      );
      this.visible.set(Math.round(visual.height));
    };
    measure();
    visual.addEventListener('resize', measure, { passive: true });
    visual.addEventListener('scroll', measure, { passive: true });
  }
}
