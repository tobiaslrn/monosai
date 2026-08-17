/**
 * Bounded inline icon set. Icons are decorative; every control that uses one
 * also carries a text label or an accessible name.
 */
export const ICON_PATHS = {
  library: 'M4 5h5a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4zm16 0h-5a3 3 0 0 0-3 3v11a3 3 0 0 1 3-3h5z',
  add: 'M12 5v14M5 12h14',
  generate:
    'M12 3l2.2 5.6L20 10l-5.8 1.4L12 17l-2.2-5.6L4 10l5.8-1.4zM18 15l.9 2.3L21 18l-2.1.7L18 21l-.9-2.3L15 18l2.1-.7z',
  vocabulary: 'M4 5h16v14H4zM4 9h16M9 9v10',
  grammar: 'M5 6h14M5 12h9M5 18h5M17 14l4 4-4 4',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4.5 12a7.5 7.5 0 0 1 .1-1.2l-2-1.5 2-3.5 2.4 1a7.5 7.5 0 0 1 2-1.2l.4-2.6h4l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1 2 3.5-2 1.5a7.5 7.5 0 0 1 0 2.4l2 1.5-2 3.5-2.4-1a7.5 7.5 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.5 7.5 0 0 1-2-1.2l-2.4 1-2-3.5 2-1.5A7.5 7.5 0 0 1 4.5 12z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  check: 'M5 13l4 4 10-10',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  file: 'M14 3H7v18h10V6zM14 3v4h4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5L21 21',
} as const;

export type IconName = keyof typeof ICON_PATHS;
