import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { connectEnvelopeSchema } from '../app/infrastructure/anki/connect/connect-response.schema';

const directory = resolve(process.cwd(), '../protocol/fixtures');
const requestSchema = z.object({
  action: z.string(),
  version: z.literal(6),
  params: z.record(z.string(), z.unknown()),
});
export const protocolFixtures = readdirSync(directory)
  .sort()
  .map((name) => ({
    name,
    request: requestSchema.parse(
      JSON.parse(readFileSync(resolve(directory, name, 'request.json'), 'utf8')),
    ),
    response: connectEnvelopeSchema.parse(
      JSON.parse(readFileSync(resolve(directory, name, 'response.json'), 'utf8')),
    ),
  }));

export function protocolResult(action: string): unknown {
  const fixture = protocolFixtures.find((entry) => entry.request.action === action);
  if (fixture === undefined) throw new Error(`Missing protocol fixture: ${action}`);
  return fixture.response.result;
}
