import { HashLocationStrategy } from '@angular/common';
import { Injectable } from '@angular/core';
import { withoutOverlayEntry, writePageHistory } from './open-overlay-guard';

/**
 * Hash routing whose writes to history are the page's own (`writePageHistory`).
 *
 * The router's push or replace never lands on an entry an open overlay holds
 * for Back, never on top of one, and never copies that entry's mark onto the
 * page's: a link inside a sheet leaves no sheet entry under the page it opens,
 * for Forward to stop on, and a page that replaces its address while a sheet
 * is open (a reading deleted in another tab sends the reader to the library)
 * leaves no entry for the old address under it, so Back cannot return to it.
 */
@Injectable()
export class OverlayHistoryLocationStrategy extends HashLocationStrategy {
  override pushState(state: unknown, title: string, path: string, queryParams: string): void {
    writePageHistory(false, () => {
      super.pushState(withoutOverlayEntry(state), title, path, queryParams);
    });
  }

  override replaceState(state: unknown, title: string, path: string, queryParams: string): void {
    writePageHistory(true, () => {
      super.replaceState(withoutOverlayEntry(state), title, path, queryParams);
    });
  }
}
