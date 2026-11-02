import { describe, expect, it, vi } from 'vitest';
import {
  parseReadingMutation,
  type ReadingMutation,
} from '../../application/reading/reading-mutation-channel';
import { readingId } from '../../domain/shared/ids';
import {
  createReadingMutationChannel,
  READING_MUTATION_CHANNEL_NAME,
  READING_MUTATION_FALLBACK_KEY,
} from './cross-tab-mutation-channel';

const ID = '3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33';
const DELETION: ReadingMutation = {
  kind: 'reading-deleted',
  id: readingId(ID),
  title: '吾輩は猫である',
};

/** A message from another tab is external input and is validated like any. */
describe('parseReadingMutation', () => {
  it('accepts a well-formed deletion', () => {
    expect(parseReadingMutation({ kind: 'reading-deleted', id: ID, title: 'A' })).toEqual({
      kind: 'reading-deleted',
      id: ID,
      title: 'A',
    });
  });

  it.each([
    ['a non-object', 'reading-deleted'],
    ['null', null],
    ['an unknown kind', { kind: 'reading-renamed', id: ID, title: 'A' }],
    ['a non-uuid id', { kind: 'reading-deleted', id: 'not-a-uuid', title: 'A' }],
    ['a missing title', { kind: 'reading-deleted', id: ID }],
    ['a non-string title', { kind: 'reading-deleted', id: ID, title: 7 }],
  ])('rejects %s', (_case, value) => {
    expect(parseReadingMutation(value)).toBeNull();
  });

  it('bounds a title from an older or hostile sender', () => {
    const parsed = parseReadingMutation({
      kind: 'reading-deleted',
      id: ID,
      title: 'あ'.repeat(500),
    });

    expect(parsed?.title.length).toBe(200);
  });
});

function fakeView(overrides: Partial<Window>): Window {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  return {
    addEventListener: (type: string, handler: (event: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener: (type: string, handler: (event: Event) => void) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((each) => each !== handler),
      );
    },
    dispatchEvent: (event: Event) => {
      for (const handler of listeners.get(event.type) ?? []) {
        handler(event);
      }
      return true;
    },
    ...overrides,
  } as unknown as Window;
}

/**
 * The transport is chosen for the browser, not assumed. A profile with no
 * `BroadcastChannel` still gets cross-tab notice through the `storage` event,
 * and one with neither still constructs and simply notifies nobody.
 */
describe('createReadingMutationChannel', () => {
  it('uses BroadcastChannel where the browser has one', () => {
    const posted: unknown[] = [];
    const constructed: string[] = [];
    class StubChannel {
      constructor(name: string) {
        constructed.push(name);
      }
      postMessage(value: unknown): void {
        posted.push(value);
      }
      addEventListener(): void {
        // Delivery between tabs is not observable in one process.
      }
      removeEventListener(): void {
        // Nothing was added.
      }
    }
    const channel = createReadingMutationChannel(
      fakeView({ BroadcastChannel: StubChannel } as unknown as Partial<Window>),
    );

    channel.publish(DELETION);

    expect(constructed).toEqual([READING_MUTATION_CHANNEL_NAME]);
    expect(posted).toEqual([DELETION]);
  });

  it('falls back to the storage event, and never keeps the key it wrote', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    const view = fakeView({
      localStorage: { setItem, removeItem } as unknown as Storage,
    });

    const channel = createReadingMutationChannel(view);
    const heard: ReadingMutation[] = [];
    const unsubscribe = channel.subscribe((mutation) => heard.push(mutation));
    channel.publish(DELETION);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(READING_MUTATION_FALLBACK_KEY);

    // What another tab would receive: the value that was written.
    const written = setItem.mock.calls[0]?.[1] as string;
    view.dispatchEvent(
      Object.assign(new Event('storage'), {
        key: READING_MUTATION_FALLBACK_KEY,
        newValue: written,
      }),
    );
    expect(heard).toEqual([DELETION]);

    unsubscribe();
    view.dispatchEvent(
      Object.assign(new Event('storage'), {
        key: READING_MUTATION_FALLBACK_KEY,
        newValue: written,
      }),
    );
    expect(heard).toHaveLength(1);
  });

  it('ignores an unrelated key and unreadable content on the fallback path', () => {
    const view = fakeView({
      localStorage: { setItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage,
    });
    const channel = createReadingMutationChannel(view);
    const heard: ReadingMutation[] = [];
    channel.subscribe((mutation) => heard.push(mutation));

    view.dispatchEvent(
      Object.assign(new Event('storage'), { key: 'something.else', newValue: '{}' }),
    );
    view.dispatchEvent(
      Object.assign(new Event('storage'), {
        key: READING_MUTATION_FALLBACK_KEY,
        newValue: 'not json',
      }),
    );

    expect(heard).toEqual([]);
  });

  it('publishes nothing and subscribes to nothing without a window', () => {
    const channel = createReadingMutationChannel(null);

    expect(() => {
      channel.publish(DELETION);
      channel.subscribe(() => undefined)();
    }).not.toThrow();
  });
});
