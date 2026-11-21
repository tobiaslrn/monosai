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

/**
 * Whether a key, once trimmed, can travel in an HTTP header.
 *
 * OpenRouter keys are printable ASCII. A key pasted from a rich-text source can
 * carry an invisible or typographic character that `trim` keeps and a browser
 * refuses to put in a header, which would otherwise surface as an unreachable
 * provider rather than as the key.
 */
export function isWellFormedApiKey(apiKey: string): boolean {
  return /^[\x21-\x7e]+$/.test(apiKey.trim());
}
