/** Browser storage durability and approximate usage, when the browser reports it. */
export interface PersistenceStatus {
  /**
   * Whether this browser offers storage protection at all.
   *
   * Separate from `canRequest`, which is false both where the browser cannot
   * be asked and where it has already granted protection. Without it, "we
   * never asked" and "there is nothing to ask" read identically.
   */
  readonly supported: boolean;
  readonly persisted: boolean;
  readonly canRequest: boolean;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

export const UNKNOWN_PERSISTENCE: PersistenceStatus = {
  supported: false,
  persisted: false,
  canRequest: false,
  usageBytes: null,
  quotaBytes: null,
};
