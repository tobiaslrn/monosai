import type {
  ReadingMutation,
  ReadingMutationChannel,
} from '../app/application/reading/reading-mutation-channel';

/**
 * An in-memory stand-in for the cross-tab channel.
 *
 * `published` is what this tab sent; `deliver` plays the part of another tab
 * sending something. Nothing is delivered back to the publisher, matching the
 * rule every real transport keeps.
 */
export class FakeReadingMutationChannel implements ReadingMutationChannel {
  readonly published: ReadingMutation[] = [];
  private readonly listeners = new Set<(mutation: ReadingMutation) => void>();

  publish(mutation: ReadingMutation): void {
    this.published.push(mutation);
  }

  subscribe(listener: (mutation: ReadingMutation) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Simulates another tab publishing. */
  deliver(mutation: ReadingMutation): void {
    for (const listener of [...this.listeners]) {
      listener(mutation);
    }
  }
}
