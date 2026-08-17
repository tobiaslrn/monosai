/**
 * What UI and application code may learn about the stored OpenRouter key.
 * The saved string is never exposed above the request adapter.
 */
export interface CredentialStatus {
  readonly isConfigured: boolean;
  readonly createdAt: number | null;
  readonly updatedAt: number | null;
}

export const NO_CREDENTIAL: CredentialStatus = {
  isConfigured: false,
  createdAt: null,
  updatedAt: null,
};
