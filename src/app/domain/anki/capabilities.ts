/**
 * A limitation the provider discovered about itself.
 *
 * These are shown to the learner as provider warnings rather than failures: a
 * bridge that cannot report card counts can still build a correct snapshot, and
 * saying so is more useful than hiding it.
 */
export interface CapabilityLimitation {
  readonly code: string;
  readonly message: string;
}

/**
 * What a provider proved it can do, established by probing rather than by
 * assuming that every AnkiConnect-compatible endpoint offers the desktop
 * action set.
 */
export interface AnkiCapabilities {
  readonly apiVersion: string;
  readonly canDiscoverDecks: boolean;
  readonly canDiscoverNoteTypes: boolean;
  readonly canDiscoverFields: boolean;
  readonly canFilterReviewed: boolean;
  readonly canReadNoteFields: boolean;
  readonly maxBatchSize?: number;
  readonly limitations: readonly CapabilityLimitation[];
}

/** The mapping editor opens only once deck, note type, and field are all discoverable. */
export function canDiscover(capabilities: AnkiCapabilities): boolean {
  return (
    capabilities.canDiscoverDecks &&
    capabilities.canDiscoverNoteTypes &&
    capabilities.canDiscoverFields
  );
}

/**
 * Refresh needs discovery plus proof of review eligibility. Without
 * `canFilterReviewed` the provider cannot show that an entry was ever studied,
 * and a snapshot built from it would misrepresent what the learner knows.
 */
export function canRefresh(capabilities: AnkiCapabilities): boolean {
  return (
    canDiscover(capabilities) && capabilities.canFilterReviewed && capabilities.canReadNoteFields
  );
}
