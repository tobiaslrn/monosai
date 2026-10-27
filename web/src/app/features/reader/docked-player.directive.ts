import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { ReaderGeometryService } from './reader-geometry.service';

/**
 * Marks the reader's player shell, whose height sheets docked to the same edge
 * have to clear.
 *
 * Tied to the shell's own lifetime, so opening, closing, or re-rendering the
 * player measures and releases it without anything having to watch for that.
 */
@Directive({ selector: '[mnDockedPlayer]' })
export class DockedPlayerDirective {
  private readonly shell = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly geometry = inject(ReaderGeometryService);

  constructor() {
    // After the shell is in the document: it has no height before then.
    afterNextRender(() => {
      this.geometry.attachPlayer(this.shell);
    });
    inject(DestroyRef).onDestroy(() => {
      this.geometry.detachPlayer(this.shell);
    });
  }
}
