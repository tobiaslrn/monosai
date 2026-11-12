import type { SelectOption } from '../../shared-ui/select/select.component';

/** What each level of thinking trades, in a line; a level the app does not know says nothing. */
const EFFORT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  minimal: 'Fastest, cheapest',
  low: 'Faster, cheaper',
  medium: 'Balanced',
  high: 'Slower, more careful',
  xhigh: 'Slowest, most careful',
};

/** Automatic first, then each effort the model accepts, each with its trade-off. */
export function reasoningOptions(efforts: readonly string[]): readonly SelectOption<string>[] {
  return [
    { value: '', label: 'Automatic', description: 'Model decides' },
    ...efforts.map((effort) => ({
      value: effort,
      label: effort.charAt(0).toLocaleUpperCase() + effort.slice(1),
      ...(EFFORT_DESCRIPTIONS[effort] === undefined
        ? {}
        : { description: EFFORT_DESCRIPTIONS[effort] }),
    })),
  ];
}
