import type { DialogRef } from '@angular/cdk/dialog';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { SheetDialogExit } from './sheet-exit';

interface Deferred {
  readonly promise: Promise<Animation>;
  resolve(): void;
  reject(): void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: () => void = () => undefined;
  const promise = new Promise<Animation>((done, fail) => {
    resolve = () => {
      done({} as Animation);
    };
    reject = () => {
      fail(new DOMException('cancelled', 'AbortError'));
    };
  });
  return { promise, resolve, reject };
}

/** A surface whose animations the test settles by hand. */
function surfaceWith(...running: readonly Deferred[]): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getAnimations', {
    value: () => running.map((animation) => ({ finished: animation.promise })),
  });
  return element;
}

/** Lets the settled animations' continuations run. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await Promise.resolve();
  }
}

describe('SheetDialogExit', () => {
  let keydown: Subject<KeyboardEvent>;
  let backdropClick: Subject<MouseEvent>;
  let closed: Subject<string | undefined>;
  let backdrop: HTMLElement;
  let closeCalls: { result: string | undefined; options: unknown }[];
  let ref: DialogRef<string>;
  let reducedMotion: boolean;

  beforeEach(() => {
    TestBed.resetTestingModule();
    keydown = new Subject();
    backdropClick = new Subject();
    closed = new Subject();
    backdrop = document.createElement('div');
    closeCalls = [];
    reducedMotion = false;
    ref = {
      disableClose: false,
      keydownEvents: keydown,
      backdropClick,
      closed,
      overlayRef: { backdropElement: backdrop },
      close: (result: string | undefined, options: unknown) => {
        closeCalls.push({ result, options });
        closed.next(result);
        closed.complete();
      },
    } as unknown as DialogRef<string>;
  });

  function exitOver(surface: HTMLElement | null): SheetDialogExit<string> {
    return new SheetDialogExit(
      ref,
      () => surface,
      () => reducedMotion,
      TestBed.inject(Injector),
    );
  }

  function escape(init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...init });
    keydown.next(event);
    return event;
  }

  it('takes dismissal from the dialog, which would close it at once', () => {
    exitOver(surfaceWith());

    expect(ref.disableClose).toBe(true);
  });

  it('stays open while the surface leaves, then closes with the result', async () => {
    const slide = deferred();
    const exit = exitOver(surfaceWith(slide));

    exit.close('draft');
    expect(exit.leaving()).toBe(true);
    expect(backdrop.classList.contains('is-leaving')).toBe(true);
    TestBed.tick();
    await flush();
    expect(closeCalls).toHaveLength(0);

    slide.resolve();
    await flush();
    expect(closeCalls).toEqual([{ result: 'draft', options: undefined }]);
  });

  it('waits for the scrim as well as the surface', async () => {
    const slide = deferred();
    const fade = deferred();
    const exit = exitOver(surfaceWith(slide));
    Object.defineProperty(backdrop, 'getAnimations', {
      value: () => [{ finished: fade.promise }],
    });

    exit.close('draft');
    TestBed.tick();
    slide.resolve();
    await flush();
    expect(closeCalls).toHaveLength(0);

    fade.resolve();
    await flush();
    expect(closeCalls).toHaveLength(1);
  });

  it('closes after the next render when there is nothing to wait for', async () => {
    const exit = exitOver(surfaceWith());

    exit.close('draft');
    expect(closeCalls).toHaveLength(0);
    TestBed.tick();
    await flush();

    expect(closeCalls).toHaveLength(1);
  });

  it('closes at once under reduced motion, without a departure', () => {
    reducedMotion = true;
    const exit = exitOver(surfaceWith(deferred()));

    exit.close('draft');

    expect(closeCalls).toEqual([{ result: 'draft', options: undefined }]);
    expect(exit.leaving()).toBe(false);
    expect(backdrop.classList.contains('is-leaving')).toBe(false);
  });

  it('closes at once when the surface is not rendered', () => {
    exitOver(null).close('draft');

    expect(closeCalls).toHaveLength(1);
  });

  it('closes once however many times it is asked', async () => {
    const slide = deferred();
    const exit = exitOver(surfaceWith(slide));

    exit.close('first');
    exit.close('second');
    escape();
    backdropClick.next(new MouseEvent('click'));
    TestBed.tick();
    slide.resolve();
    await flush();
    exit.close('third');

    expect(closeCalls).toEqual([{ result: 'first', options: undefined }]);
  });

  it('routes Escape through the departure and hands focus back as a keyboard user', async () => {
    const exit = exitOver(surfaceWith());

    const event = escape();
    expect(event.defaultPrevented).toBe(true);
    expect(exit.leaving()).toBe(true);
    TestBed.tick();
    await flush();

    expect(closeCalls).toEqual([{ result: undefined, options: { focusOrigin: 'keyboard' } }]);
  });

  it('ignores other keys and Escape held with a modifier', () => {
    const exit = exitOver(surfaceWith());

    keydown.next(new KeyboardEvent('keydown', { key: 'Enter' }));
    escape({ ctrlKey: true });
    escape({ shiftKey: true });

    expect(exit.leaving()).toBe(false);
  });

  it('routes a press on the backdrop through the departure', async () => {
    const exit = exitOver(surfaceWith());

    backdropClick.next(new MouseEvent('click'));
    expect(exit.leaving()).toBe(true);
    TestBed.tick();
    await flush();

    expect(closeCalls).toEqual([{ result: undefined, options: { focusOrigin: 'mouse' } }]);
  });

  it('closes when the surface leaves by being cancelled', async () => {
    const slide = deferred();
    const exit = exitOver(surfaceWith(slide));

    exit.close('draft');
    TestBed.tick();
    slide.reject();
    await flush();

    expect(closeCalls).toHaveLength(1);
  });

  it('does not close a dialog that was disposed while it was leaving', async () => {
    const slide = deferred();
    const exit = exitOver(surfaceWith(slide));

    exit.close('draft');
    TestBed.tick();
    // A route change disposes the overlay, which closes the dialog by itself.
    closed.next(undefined);
    closed.complete();
    slide.resolve();
    await flush();
    exit.close('again');
    escape();

    expect(closeCalls).toHaveLength(0);
  });

  it('does not start leaving a dialog that has already gone', () => {
    const exit = exitOver(surfaceWith());
    closed.complete();

    exit.close('draft');

    expect(exit.leaving()).toBe(false);
    expect(closeCalls).toHaveLength(0);
  });
});
