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
  it('covers exactly the read allowlist and a refused write', () => {
    expect(
      protocolFixtures
        .filter((f) => f.response.error === null)
        .map((f) => f.request.action)
        .sort(),
    ).toEqual([...ALLOWED_ACTIONS].sort());
  });
  for (const fixture of protocolFixtures) {
    it(`parses and reproduces ${fixture.name}`, async () => {
      if (fixture.response.error === null) {
        const schema = schemas[fixture.request.action as keyof typeof schemas];
        expect(schema.safeParse(fixture.response.result).success).toBe(true);
      } else {
        expect(fixture.response).toEqual({ result: null, error: 'unsupported action: addNote' });
      }
      const response = await new FakeAnkiConnectServer().fetch('http://localhost', {
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
