import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type ActivatedRouteSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { firstUseRedirect } from './first-use.resolver';

describe('firstUseRedirect', () => {
  it('opens Home', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    const target = TestBed.runInInjectionContext(() =>
      firstUseRedirect({} as ActivatedRouteSnapshot, { url: '/', root: {} as never }),
    );

    expect(TestBed.inject(Router).serializeUrl(target as never)).toBe('/home');
  });
});
