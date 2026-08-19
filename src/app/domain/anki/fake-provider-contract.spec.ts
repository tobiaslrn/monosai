import {
  CONTRACT_COLLECTION,
  NO_REVIEW_EVIDENCE_COLLECTION,
} from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { runProviderContract } from '../../../testing/anki-provider-contract';

/**
 * Runs the shared contract against the reference implementation.
 *
 * This is what makes the contract meaningful for the real adapters: it proves
 * the expectations are satisfiable and that a failure elsewhere is the
 * adapter's, not the suite's.
 */
runProviderContract(
  'fake',
  {
    standard: () => ({ provider: new FakeAnkiProvider(CONTRACT_COLLECTION) }),
    withoutReviewEvidence: () => ({
      provider: new FakeAnkiProvider(NO_REVIEW_EVIDENCE_COLLECTION),
    }),
  },
  'package',
);
