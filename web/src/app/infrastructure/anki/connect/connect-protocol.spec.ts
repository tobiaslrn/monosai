import { describe, expect, it } from 'vitest';
import { protocolFixtures } from '../../../../testing/connect-protocol';
import { FakeAnkiConnectServer } from '../../../../testing/anki-connect-server';
import { ALLOWED_ACTIONS } from './allowed-actions';
import { AndroidConnectAdapter } from './android-connect.adapter';
import { DesktopConnectAdapter } from './desktop-connect.adapter';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import {
  cardIdListSchema,
  cardsInfoSchema,
  nameListSchema,
  notesInfoSchema,
  permissionSchema,
  versionSchema,
} from './connect-response.schema';

describe('cardsInfoSchema', () => {
  const card = { cardId: 1, note: 1, reps: 3, queue: 2, deckName: 'Core Japanese' };

  it("reads the desktop add-on's card type from its own `type` key", () => {
    const parsed = cardsInfoSchema.parse([{ ...card, type: 1 }]);
    expect(parsed[0]).toMatchObject({ cardType: 1 });
    expect(parsed[0]).not.toHaveProperty('type');
  });

  it("keeps the bridge's `cardType` when both keys are present", () => {
    expect(cardsInfoSchema.parse([{ ...card, cardType: 2, type: 1 }])[0]?.cardType).toBe(2);
  });
});

describe('shared bridge wire fixtures', () => {
  const schemas = {
    version: versionSchema,
    requestPermission: permissionSchema,
    deckNames: nameListSchema,
    modelNames: nameListSchema,
    modelFieldNames: nameListSchema,
    findCards: cardIdListSchema,
    cardsInfo: cardsInfoSchema,
    notesInfo: notesInfoSchema,
  };
  /**
   * Allowed of the desktop add-on, but deliberately not implemented by the
   * bridge: AnkiDroid's content provider exposes no review log, so the fixture
   * records the refusal the extraction path is written to fall back from.
   */
  const REFUSED_BY_BRIDGE = ['getReviewsOfCards'];
  it('covers exactly the read allowlist and a refused write', () => {
    expect(protocolFixtures.map((f) => f.request.action).sort()).toEqual(
      [...ALLOWED_ACTIONS, 'addNote'].sort(),
    );
    expect(
      protocolFixtures
        .filter((f) => f.response.error !== null)
        .map((f) => f.request.action)
        .sort(),
    ).toEqual([...REFUSED_BY_BRIDGE, 'addNote'].sort());
  });
  for (const fixture of protocolFixtures) {
    it(`parses and reproduces ${fixture.name}`, async () => {
      if (fixture.response.error === null) {
        const schema = schemas[fixture.request.action as keyof typeof schemas];
        expect(schema.safeParse(fixture.response.result).success).toBe(true);
      } else {
        expect(fixture.response).toEqual({
          result: null,
          error: `unsupported action: ${fixture.request.action}`,
        });
      }
      const response = await new FakeAnkiConnectServer(undefined, {
        unimplementedActions: REFUSED_BY_BRIDGE,
      }).fetch('http://localhost', {
        body: JSON.stringify(fixture.request),
      });
      expect(await response.json()).toEqual(fixture.response);
    });
  }
  for (const Adapter of [DesktopConnectAdapter, AndroidConnectAdapter]) {
    it(`runs the fixture collection through ${Adapter.name}`, async () => {
      const adapter = new Adapter(
        new AnkiConnectClient({
          endpoints: DESKTOP_ENDPOINTS,
          fetchFn: new FakeAnkiConnectServer().fetch,
          pageOrigin: 'http://localhost:4200',
          unreachableCode: 'bridge-not-running',
        }),
      );
      expect((await adapter.probe()).ok).toBe(true);
      const catalog = await adapter.discover();
      expect(catalog.ok).toBe(true);
      if (!catalog.ok) return;
      const samples = await adapter.sampleFields(catalog.value);
      expect(samples.ok && samples.value[0].fields['Expression']).toBe('ねこ');
    });
  }
});
