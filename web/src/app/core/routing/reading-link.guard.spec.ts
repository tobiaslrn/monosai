import { TestBed } from '@angular/core/testing';
import { UrlSegment, type Route } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { wellFormedReadingLink } from './reading-link.guard';

const ROUTE: Route = { path: 'reader/:id' };

function match(id: string): boolean {
  const segments = [new UrlSegment('reader', {}), new UrlSegment(id, {})];
  return TestBed.runInInjectionContext(
    () =>
      wellFormedReadingLink(
        ROUTE,
        segments,
        // The match phase snapshot is not read by this guard.
        {} as unknown as ActivatedRouteSnapshot,
      ) as boolean,
  );
}

/**
 * `canMatch` rather than a redirect, so a mistyped link falls through to a
 * screen that can say what is true about it instead of quietly becoming the
 * Library or claiming a reading was deleted.
 */
describe('wellFormedReadingLink', () => {
  it('matches the reader for an id the application could have issued', () => {
    expect(match('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33')).toBe(true);
  });

  it('does not match the reader for an id that never named a reading', () => {
    expect(match('not-a-uuid')).toBe(false);
  });
});
