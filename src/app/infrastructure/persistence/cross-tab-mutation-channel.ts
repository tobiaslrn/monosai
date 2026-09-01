import {
  parseReadingMutation,
  type ReadingMutation,
  type ReadingMutationChannel,
} from '../../application/reading/reading-mutation-channel';

/** Same-origin channel name; the profile's other tabs listen on it. */
export const READING_MUTATION_CHANNEL_NAME = 'monosai.reading-mutations';

/**
 * The `storage`-event fallback key.
 *
 * Written and immediately removed: the value only has to exist long enough for
 * the event to carry it. `localStorage` is not used as storage here.
 */
export const READING_MUTATION_FALLBACK_KEY = 'monosai.reading-mutation';

interface Envelope {
  readonly mutation: unknown;
  /** Makes two identical deletions distinct values, so the event still fires. */
  readonly at: number;
}

/** Delivers reading mutations to the other tabs through `BroadcastChannel`. */
class BroadcastMutationChannel implements ReadingMutationChannel {
  constructor(private readonly channel: BroadcastChannel) {}

  publish(mutation: ReadingMutation): void {
    this.channel.postMessage(mutation);
  }

  subscribe(listener: (mutation: ReadingMutation) => void): () => void {
    const handler = (event: MessageEvent<unknown>): void => {
      const mutation = parseReadingMutation(event.data);
      if (mutation !== null) {
        listener(mutation);
      }
    };
    this.channel.addEventListener('message', handler);
    return () => {
      this.channel.removeEventListener('message', handler);
    };
  }
}

/**
 * Delivers reading mutations through a `localStorage` write and the `storage`
 * event it raises in every other tab.
 *
 * This is the compatibility path for browsers without `BroadcastChannel`. The
 * `storage` event is deliberately never delivered to the tab that wrote it, so
 * the "never hear your own message" rule holds for free.
 */
class StorageEventMutationChannel implements ReadingMutationChannel {
  constructor(
    private readonly storage: Storage,
    private readonly view: Window,
  ) {}

  publish(mutation: ReadingMutation): void {
    const envelope: Envelope = { mutation, at: Date.now() };
    try {
      this.storage.setItem(READING_MUTATION_FALLBACK_KEY, JSON.stringify(envelope));
      this.storage.removeItem(READING_MUTATION_FALLBACK_KEY);
    } catch {
      // A full or blocked storage costs the other tabs a live update and
      // nothing else; the deletion itself already succeeded.
    }
  }

  subscribe(listener: (mutation: ReadingMutation) => void): () => void {
    const handler = (event: StorageEvent): void => {
      if (event.key !== READING_MUTATION_FALLBACK_KEY || event.newValue === null) {
        return;
      }
      const mutation = parseReadingMutation(readEnvelope(event.newValue));
      if (mutation !== null) {
        listener(mutation);
      }
    };
    this.view.addEventListener('storage', handler);
    return () => {
      this.view.removeEventListener('storage', handler);
    };
  }
}

/** Used where neither transport exists; every tab stays correct on its own. */
class InertMutationChannel implements ReadingMutationChannel {
  publish(): void {
    // Nothing to tell, and nobody to tell it to.
  }

  subscribe(): () => void {
    return () => {
      // Nothing was subscribed.
    };
  }
}

function readEnvelope(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['mutation']
      : null;
  } catch {
    return null;
  }
}

/**
 * Picks the best transport this browser offers.
 *
 * `BroadcastChannel` first because it is a real message bus; the `storage`
 * event second because it reaches every browser that has `localStorage`; doing
 * nothing last, so a locked-down or server-side context still constructs.
 */
export function createReadingMutationChannel(view: Window | null): ReadingMutationChannel {
  if (view === null) {
    return new InertMutationChannel();
  }
  const broadcast = (view as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (typeof broadcast === 'function') {
    try {
      return new BroadcastMutationChannel(new broadcast(READING_MUTATION_CHANNEL_NAME));
    } catch {
      // Fall through to the storage event.
    }
  }
  try {
    return new StorageEventMutationChannel(view.localStorage, view);
  } catch {
    // Access to `localStorage` can throw where site data is blocked.
  }
  return new InertMutationChannel();
}
