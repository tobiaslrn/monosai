/**
 * The loopback contract the first-party Android bridge and this application
 * negotiate against.
 *
 * Three version identities exist and only this one is negotiated. AnkiConnect's
 * request-format version is the constant `6` and describes the wire shape, not
 * the build behind it. The bridge's release version in `android-bridge/version.txt`
 * is a human-facing release identity. Comparing that here would give this
 * application opinions about the bridge's release numbering, and a patch release
 * would read as a change in what the bridge can do.
 *
 * So the contract is one integer that moves only when the contract itself moves,
 * and `protocol/contract.txt` is where it is declared for both sides.
 */

/**
 * The contract this build was written against.
 *
 * Kept equal to `protocol/contract.txt` by `bridge-contract.spec.ts`, the same
 * way `APP_VERSION` is kept equal to the package version.
 */
export const KNOWN_BRIDGE_CONTRACT = 1;

/**
 * The lowest contract Monosai will still read a collection from.
 *
 * This only rises when a lower contract would make the application show
 * something *wrong* — never to encourage an update. It is the same posture as
 * the `review-evidence-unsupported` refusal: Monosai would rather decline than
 * guess, but declining is not a way to nudge anyone.
 *
 * It starts at the first contract because no bridge was ever published without
 * one, so nothing in the world is stranded by this floor.
 */
export const MINIMUM_BRIDGE_CONTRACT = 1;

/** What a bridge said it is, as it arrives on the wire. */
export interface BridgeIdentity {
  readonly version: string;
  readonly contract: number;
}

/**
 * How the bridge that answered relates to the contract this build knows.
 *
 * `unidentified` is load-bearing rather than a fallback. Monosai talks to any
 * AnkiConnect-compatible endpoint on the Android loopback port, and a
 * third-party bridge has no reason to announce a Monosai contract. Only an
 * endpoint that claims to be the first-party bridge is held to its version;
 * everything else is left to the capability probe, exactly as before.
 */
export type BridgeCompatibility =
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'too-old'; readonly identity: BridgeIdentity }
  | { readonly kind: 'behind'; readonly identity: BridgeIdentity }
  | { readonly kind: 'current'; readonly identity: BridgeIdentity }
  | { readonly kind: 'ahead'; readonly identity: BridgeIdentity };

/**
 * Classifies the bridge that answered.
 *
 * `ahead` is deliberately not a warning. The bridge's own rule is that it never
 * breaks an older caller within a major version — it may only add actions, add
 * optional keys, and relax limits — so a newer bridge answering an older
 * application is the case the contract is designed to make uneventful.
 */
export function compareBridgeContract(identity: BridgeIdentity | undefined): BridgeCompatibility {
  if (identity === undefined) {
    return { kind: 'unidentified' };
  }
  if (identity.contract < MINIMUM_BRIDGE_CONTRACT) {
    return { kind: 'too-old', identity };
  }
  if (identity.contract < KNOWN_BRIDGE_CONTRACT) {
    return { kind: 'behind', identity };
  }
  if (identity.contract > KNOWN_BRIDGE_CONTRACT) {
    return { kind: 'ahead', identity };
  }
  return { kind: 'current', identity };
}

/**
 * What the learner is told about a bridge that is usable but older than this
 * build expects.
 *
 * Phrased against the contract rather than a feature list: at the first contract
 * there is nothing for a feature table to hold, and inventing one now would be a
 * shape with no contents. When a later contract adds something this application
 * depends on, the name of that thing belongs in this sentence.
 */
export function outdatedBridgeMessage(identity: BridgeIdentity): string {
  return `Monosai Bridge ${identity.version} is older than this version of Monosai expects. Reading your collection still works; some newer details may be missing.`;
}
