import * as z from 'zod';
import { describe, expect, it } from 'vitest';
import { parseRecord, withoutUndefinedProperties } from './record-validation';

const rowSchema = z.object({
  id: z.string(),
  meaningFieldName: z.string().exactOptional(),
  tokens: z.array(z.object({ surface: z.string(), lemma: z.string().exactOptional() })),
});

describe('parseRecord', () => {
  it('reads a stored optional property set to undefined as absent', () => {
    const parsed = parseRecord(
      rowSchema,
      { id: 'a', meaningFieldName: undefined, tokens: [{ surface: '猫', lemma: undefined }] },
      'test',
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect('meaningFieldName' in parsed.value).toBe(false);
    expect('lemma' in parsed.value.tokens[0]!).toBe(false);
  });

  it('validates a valid row as stored, without copying it first', () => {
    const received: unknown[] = [];
    const recording = z.custom<unknown>((value) => {
      received.push(value);
      return true;
    });
    const row = { id: 'a', tokens: [{ surface: '猫' }] };

    expect(parseRecord(recording, row, 'test').ok).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(row);
  });

  it('still rejects a required property that is undefined', () => {
    expect(parseRecord(rowSchema, { id: undefined, tokens: [] }, 'test').ok).toBe(false);
  });
});

describe('withoutUndefinedProperties', () => {
  it('returns a value with nothing to drop unchanged', () => {
    const row = { id: 'a', tokens: [{ surface: '猫' }] };

    expect(withoutUndefinedProperties(row)).toBe(row);
  });

  it('leaves non-plain objects such as blobs alone', () => {
    const blob = new Blob(['x']);

    expect(withoutUndefinedProperties({ blob, gone: undefined })).toEqual({ blob });
    expect(withoutUndefinedProperties(blob)).toBe(blob);
  });
});
