import type { IconName } from '../../shared-ui/icon/icon-set';

/**
 * Primary destinations. Items are registered here as their feature lands so
 * navigation never points at an unimplemented route.
 */
export interface NavigationItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  /** Mobile bottom bar holds primary items; the rest move into the More sheet. */
  readonly mobilePlacement: 'bar' | 'more';
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { path: '/grammar', label: 'Grammar', icon: 'grammar', mobilePlacement: 'bar' },
  { path: '/settings', label: 'Settings', icon: 'settings', mobilePlacement: 'bar' },
];

export function barItems(items: readonly NavigationItem[]): readonly NavigationItem[] {
  return items.filter((item) => item.mobilePlacement === 'bar');
}

export function moreItems(items: readonly NavigationItem[]): readonly NavigationItem[] {
  return items.filter((item) => item.mobilePlacement === 'more');
}
