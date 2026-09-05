import { Injectable } from '@angular/core';

/** Keeps Library context while another routed screen temporarily owns the viewport. */
@Injectable({ providedIn: 'root' })
export class LibraryScrollMemoryService {
  private position: number | null = null;

  remember(position: number): void {
    this.position = position;
  }

  take(): number | null {
    const position = this.position;
    this.position = null;
    return position;
  }
}
