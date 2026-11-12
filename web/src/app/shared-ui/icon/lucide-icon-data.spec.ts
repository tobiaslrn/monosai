import * as lucide from '@lucide/angular';
import { describe, expect, it } from 'vitest';
import { LUCIDE_ICON_DATA } from './lucide-icon-data';

describe('the bundled Lucide icon data', () => {
  const library = lucide as unknown as Record<string, { icon?: unknown }>;

  it.each(Object.entries(LUCIDE_ICON_DATA))(
    'draws %s as the installed library does',
    (name, data) => {
      expect(data).toEqual(library[`Lucide${name}`]?.icon);
    },
  );
});
