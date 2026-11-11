import { Injectable } from '@angular/core';

/**
 * Keeps Library context while another routed screen temporarily owns the viewport.
 *
 * A position alone cannot be returned to: the height of the shelf above it is
 * only known for the rows that were laid out, so the measured heights travel
 * with it and the shelf is the same height on the way back.
 */
@Injectable({ providedIn: 'root' })
export class LibraryScrollMemoryService {
  private position: number | null = null;
  private heights: ReadonlyMap<string, number> | null = null;

  remember(position: number): void {
    this.position = position;
    this.heights = null;
  }

  rememberHeights(heights: ReadonlyMap<string, number>): void {
    if (this.position !== null) {
      this.heights = heights;
    }
  }

  take(): number | null {
    const position = this.position;
    this.position = null;
    return position;
  }

  /** The heights saved with the position, for the shelf that is returned to. */
  takeHeights(): ReadonlyMap<string, number> | null {
    const heights = this.heights;
    this.heights = null;
    return heights;
  }
}
