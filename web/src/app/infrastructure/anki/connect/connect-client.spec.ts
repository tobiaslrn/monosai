import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../../application/shared/diagnostics';
import { CONTRACT_COLLECTION } from '../../../../testing/anki-collection';
import { FakeAnkiConnectServer } from '../../../../testing/anki-connect-server';
import { AnkiConnectClient, DESKTOP_ENDPOINTS, desktopEndpoints } from './connect-client';

function clientWith(
  fetchFn: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof AnkiConnectClient>[0]> = {},
): AnkiConnectClient {
  return new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
    ...overrides,
  });
}

describe('AnkiConnectClient', () => {
  it('classifies an unrecognised error after version as an unsupported action', async () => {
    const client = clientWith((_input, init) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      return Promise.resolve(
        new Response(
          JSON.stringify(
            body.action === 'version'
              ? { result: 6, error: null }
              : {
                  result: null,
                  error: 'java.lang.IllegalStateException: Expected BEGIN_OBJECT but was STRING',
                },
          ),
        ),
      );
    });
    await client.version();
    const result = await client.requestPermission();
    expect(!result.ok && result.error.code).toBe('unsupported-action');
  });

  it('reports a killed Android bridge as unavailable even after a successful read on Pages', async () => {
    let running = true;
    const client = clientWith(
      () => {
        if (!running) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(new Response(JSON.stringify({ result: 6, error: null })));
      },
      { unreachableCode: 'bridge-not-running', pageOrigin: 'https://tobiaslrn.github.io' },
    );
    await client.version();
    running = false;
    const result = await client.deckNames();
    expect(!result.ok && result.error.code).toBe('bridge-not-running');
  });

  it.each([
    'ankidroid-not-installed',
    'ankidroid-permission-denied',
    'review-evidence-unsupported',
    'origin-not-allowed',
  ] as const)('preserves the bridge error %s', async (code) => {
    const client = clientWith(() =>
      Promise.resolve(new Response(JSON.stringify({ result: null, error: code }))),
    );
    const result = await client.requestPermission();
    expect(!result.ok && result.error.code).toBe(code);
  });

  it('builds only loopback endpoints for a custom port', () => {
    expect(desktopEndpoints(9_999)).toEqual(['http://127.0.0.1:9999', 'http://localhost:9999']);
  });

  it('uses a CORS-simple request so Anki can display its permission prompt', async () => {
    let request: RequestInit | undefined;
    const client = clientWith((_input, init) => {
      request = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: { permission: 'granted', requireApikey: false, version: 6 },
            error: null,
          }),
        ),
      );
    });

    const result = await client.requestPermission();

    expect(result.ok).toBe(true);
    expect(new Headers(request?.headers).has('Content-Type')).toBe(false);
  });

  it('logs an unavailable local Anki service as a warning', async () => {
    const warn = vi.fn();
    const error = vi.fn();
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error,
      snapshot: vi.fn(() => []),
      clear: vi.fn(),
    } as unknown as Logger;
    const client = clientWith(
      new FakeAnkiConnectServer(CONTRACT_COLLECTION, { transportFailure: true }).fetch,
      { logger },
    );

    await client.version();

    expect(warn).toHaveBeenCalledWith('anki.operation.failed', {
      action: 'version',
      errorCode: 'not-running',
    });
    expect(error).not.toHaveBeenCalled();
  });

  describe('requests', () => {
    it('posts the action with the protocol version to an allowlisted endpoint', async () => {
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const spy = vi.fn(server.fetch);
      const client = clientWith(spy);

      await client.version();

      const [url, init] = spy.mock.calls[0];
      expect(DESKTOP_ENDPOINTS).toContain(url);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
        action: 'version',
        version: 6,
        params: {},
      });
    });

    it('sends no credentials to a local unauthenticated endpoint', async () => {
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const spy = vi.fn(server.fetch);
      await clientWith(spy).version();
      expect(spy.mock.calls[0][1]?.credentials).toBe('omit');
    });

    it('sticks to the endpoint that answered', async () => {
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const client = clientWith(server.fetch);

      await client.version();
      const endpoint = client.endpoint;
      await client.deckNames();

      expect(endpoint).not.toBeNull();
      expect(client.endpoint).toBe(endpoint);
    });

    it('tries the next allowlisted address when the first refuses', async () => {
      const attempted: string[] = [];
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const client = clientWith(async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        attempted.push(url);
        if (url === DESKTOP_ENDPOINTS[0]) {
          throw new TypeError('Failed to fetch');
        }
        return server.fetch(input, init);
      });

      const version = await client.version();
      expect(version.ok).toBe(true);
      expect(attempted).toEqual([...DESKTOP_ENDPOINTS]);
    });
  });

  describe('error variants', () => {
    it('reports a stopped application when nothing answers anywhere', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, {
          transportFailure: true,
        }).fetch,
      );

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('not-running');
    });

    it('reports the bridge variant for an Android endpoint', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { transportFailure: true }).fetch,
        { unreachableCode: 'bridge-not-running' },
      );

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('bridge-not-running');
    });

    it('reports a rejected origin when the page is not served locally', async () => {
      // AnkiConnect allows `http://localhost` and `http://127.0.0.1` out of the
      // box and answers anything else with a 403 the browser reports as an
      // opaque failure, so a non-local page is refused rather than unreachable.
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { transportFailure: true }).fetch,
        { pageOrigin: 'https://example.github.io' },
      );

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('origin-not-allowed');
      expect(result.error.cause).toBe('https://example.github.io');
    });

    it('reports a rejected origin once an endpoint has already answered', async () => {
      let failing = false;
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const client = clientWith(async (input, init) => {
        if (failing) {
          throw new TypeError('Failed to fetch');
        }
        return server.fetch(input, init);
      });

      await client.version();
      failing = true;

      const result = await client.deckNames();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('origin-not-allowed');
    });

    it('reports an unsupported action distinctly from a query failure', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, {
          unsupportedActions: ['modelFieldNames'],
        }).fetch,
      );

      const result = await client.modelFieldNames('Basic');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('unsupported-action');
    });

    it('maps an action failure to the code of the operation that failed', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { failingActions: ['deckNames'] }).fetch,
      );

      const result = await client.deckNames();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('query-failed');
    });

    it('reports a denied permission rather than treating it as a failure to reach Anki', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, {
          failingActions: ['requestPermission'],
        }).fetch,
      );

      const result = await client.requestPermission();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('query-failed');
    });

    it('rejects a response that is not JSON', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { malformedActions: ['version'] }).fetch,
      );

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('malformed-response');
    });

    it('rejects a result whose shape is not what the action promises', async () => {
      const client = clientWith(() =>
        Promise.resolve(
          new Response(JSON.stringify({ result: { unexpected: true }, error: null }), {
            status: 200,
          }),
        ),
      );

      const result = await client.deckNames();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('malformed-response');
    });

    it('rejects a partial card record rather than assuming zero reviews', async () => {
      const client = clientWith(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ result: [{ cardId: 1, note: 1, deckName: 'A' }], error: null }),
            { status: 200 },
          ),
        ),
      );

      const result = await client.cardsInfo([1]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('malformed-response');
    });

    it('reports an unexpected HTTP status', async () => {
      const client = clientWith(() => Promise.resolve(new Response('nope', { status: 500 })));

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('unsupported-api');
    });
  });

  describe('timeouts and cancellation', () => {
    it('gives up on an endpoint that never answers', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { delayMs: 200 }).fetch,
        { timeoutMs: 10 },
      );

      const result = await client.version();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('timeout');
    });

    it('refuses a request whose signal was already aborted', async () => {
      const server = new FakeAnkiConnectServer(CONTRACT_COLLECTION);
      const spy = vi.fn(server.fetch);
      const controller = new AbortController();
      controller.abort();

      const result = await clientWith(spy).version(controller.signal);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('cancelled');
      expect(spy).not.toHaveBeenCalled();
    });

    it('reports cancellation when the signal aborts in flight', async () => {
      const client = clientWith(
        new FakeAnkiConnectServer(CONTRACT_COLLECTION, { delayMs: 50 }).fetch,
      );
      const controller = new AbortController();

      const pending = client.version(controller.signal);
      controller.abort();

      const result = await pending;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('cancelled');
    });
  });
});
