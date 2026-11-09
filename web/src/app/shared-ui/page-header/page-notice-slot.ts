import { Injectable, signal, type TemplateRef } from '@angular/core';

/**
 * A notice the application frame places on whichever page is showing: in the
 * page's own column, directly under its bar, so it shares the page's edges and
 * never floats above the bar as a strip of its own.
 *
 * The frame provides it and sets the template; `mn-page-header` draws it.
 * Without a provider, a page header draws nothing extra.
 */
@Injectable()
export class PageNoticeSlot {
  readonly template = signal<TemplateRef<unknown> | null>(null);
}
