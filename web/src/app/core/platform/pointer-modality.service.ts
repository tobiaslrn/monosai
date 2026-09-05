import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** What `data-pointer` on the document root is set to, for CSS to key off. */
export type PointerModality = 'mouse' | 'touch';

/**
 * Which device the reader is currently using.
 *
 * A media query alone cannot answer this. A touchscreen laptop reports
 * `hover: hover` and still leaves a tap's hover state stuck on the word that
 * was tapped, and a phone synthesizes `mouseenter` after every tap — which is
 * how a hover preview and a hover tint ended up appearing at random on a
 * phone. The last real pointer event is the only reliable answer, so the
 * service starts from the media query and then follows the hardware.
 *
 * The answer is published twice: as a signal, for behavior that has to be
 * decided in TypeScript, and as `data-pointer` on the document root, so that
 * hover styling anywhere in the application can be written as a plain selector
 * instead of being duplicated in every component that has a hover state.
 */
@Injectable({ providedIn: 'root' })
export class PointerModalityService {
  private readonly document = inject(DOCUMENT);

  private readonly modality = signal<PointerModality>(this.initialModality());

  /** The device behind the most recent pointer event. */
  readonly current = this.modality.asReadonly();

  constructor() {
    this.publish(this.modality());
    const view = this.document.defaultView;
    view?.addEventListener(
      'pointerdown',
      (event: PointerEvent) => {
        this.set(event.pointerType === 'mouse' ? 'mouse' : 'touch');
      },
      { capture: true, passive: true },
    );
    // A pointer that moves without a button held is a mouse or a trackpad: a
    // finger cannot hover. This is what returns a hybrid device to mouse rules
    // after the reader puts the touchscreen down and picks the mouse back up.
    view?.addEventListener(
      'pointermove',
      (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
          this.set('mouse');
        }
      },
      { capture: true, passive: true },
    );
  }

  /** True while the last thing that touched the page was a finger or a pen. */
  isTouch(): boolean {
    return this.modality() === 'touch';
  }

  private set(modality: PointerModality): void {
    if (this.modality() === modality) {
      return;
    }
    this.modality.set(modality);
    this.publish(modality);
  }

  private publish(modality: PointerModality): void {
    this.document.documentElement.dataset['pointer'] = modality;
  }

  /**
   * What to assume before the reader has touched anything.
   *
   * A touchscreen is enough to start in touch rules, even on a device that also
   * reports a fine pointer: the first mouse movement switches back, and
   * starting the other way round means the first tap on such a device is made
   * against mouse styling that changes underneath it mid-gesture.
   */
  private initialModality(): PointerModality {
    const view = this.document.defaultView;
    if (view?.navigator.maxTouchPoints !== undefined && view.navigator.maxTouchPoints > 0) {
      return 'touch';
    }
    if (!view?.matchMedia) {
      return 'mouse';
    }
    return view.matchMedia('(hover: none), (pointer: coarse)').matches ? 'touch' : 'mouse';
  }
}
