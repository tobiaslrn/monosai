/** Browser storage durability and approximate usage, when the browser reports it. */
export interface PersistenceStatus {
  readonly persisted: boolean;
  readonly canRequest: boolean;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

export const UNKNOWN_PERSISTENCE: PersistenceStatus = {
  persisted: false,
  canRequest: false,
  usageBytes: null,
  quotaBytes: null,
};
