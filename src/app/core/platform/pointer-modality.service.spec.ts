import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PointerModalityService } from './pointer-modality.service';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';

function pointerDown(pointerType: string): void {
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType }));
}

function pointerMove(pointerType: string): void {
  document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType }));
}

describe('PointerModalityService', () => {
  let media: FakeMediaMatcher;

  beforeEach(() => {
    TestBed.resetTestingModule();
    media = installFakeMatchMedia(1440);
    delete document.documentElement.dataset['pointer'];
  });

  afterEach(() => {
    media.restore();
    delete document.documentElement.dataset['pointer'];
  });

  it('starts from what the device reports and publishes it on the document', () => {
    const service = TestBed.inject(PointerModalityService);

    expect(service.current()).toBe('mouse');
    expect(service.isTouch()).toBe(false);
    expect(document.documentElement.dataset['pointer']).toBe('mouse');
  });

  it('follows the hardware, so a tap on a hybrid device is not a hover', () => {
    const service = TestBed.inject(PointerModalityService);

    pointerDown('touch');
    expect(service.isTouch()).toBe(true);
    expect(document.documentElement.dataset['pointer']).toBe('touch');

    // A finger cannot hover, so a pointer moving with no button held is the
    // mouse being picked back up.
    pointerMove('mouse');
    expect(service.isTouch()).toBe(false);
    expect(document.documentElement.dataset['pointer']).toBe('mouse');
  });

  it('treats a pen like a finger, because it cannot hover either', () => {
    const service = TestBed.inject(PointerModalityService);

    pointerDown('pen');

    expect(service.current()).toBe('touch');
  });
});
