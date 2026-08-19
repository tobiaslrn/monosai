import {
  CONTRACT_COLLECTION,
  NO_REVIEW_EVIDENCE_COLLECTION,
} from '../../../../testing/anki-collection';
import { FakeAnkiConnectServer } from '../../../../testing/anki-connect-server';
import { runProviderContract } from '../../../../testing/anki-provider-contract';
import { AndroidConnectAdapter } from './android-connect.adapter';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import { DesktopConnectAdapter } from './desktop-connect.adapter';

function clientFor(server: FakeAnkiConnectServer): AnkiConnectClient {
  return new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn: server.fetch,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
  });
}

/**
 * Runs the shared contract against both HTTP adapters.
 *
 * The point of running the same suite here as against the fake and the package
 * pipeline is that a snapshot has to mean the same thing whichever source built
 * it. Three genuinely different implementations answering identically is what
 * makes that true rather than hoped for.
 */
runProviderContract(
  'desktop AnkiConnect',
  {
    standard: () => ({
      provider: new DesktopConnectAdapter(
        clientFor(new FakeAnkiConnectServer(CONTRACT_COLLECTION)),
      ),
    }),
    withoutReviewEvidence: () => ({
      provider: new DesktopConnectAdapter(
        clientFor(new FakeAnkiConnectServer(NO_REVIEW_EVIDENCE_COLLECTION)),
      ),
    }),
  },
  'desktop-connect',
);

runProviderContract(
  'Android bridge',
  {
    standard: () => ({
      provider: new AndroidConnectAdapter(
        clientFor(new FakeAnkiConnectServer(CONTRACT_COLLECTION)),
      ),
    }),
  },
  'android-connect',
);
