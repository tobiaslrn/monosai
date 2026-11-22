/**
 * The gallery's pages: one per group of shared-ui primitives, in the order the
 * index lists them. Plain data with no Angular in it, so the screenshot suite
 * (`e2e-visual/`) reads the same list and cannot miss a page.
 */
export const GALLERY_PAGES = [
  { slug: 'rows', title: 'Rows and settings', summary: 'Every trailing end and state' },
  { slug: 'buttons', title: 'Buttons', summary: 'Emphases, chips and clusters' },
  { slug: 'fields', title: 'Fields and choices', summary: 'Fields, checkboxes and options' },
  { slug: 'overlays', title: 'Overlays', summary: 'Dialogs, pickers, menus and sheets' },
  { slug: 'status', title: 'Status and notices', summary: 'Notices, banners and status lines' },
  { slug: 'lists', title: 'Lists and cards', summary: 'Shelf rows, entries and facts' },
  { slug: 'states', title: 'Whole-page states', summary: 'Empty, error, outcome and working' },
  { slug: 'progress', title: 'Steps and progress', summary: 'Checklists, steppers and steps' },
  { slug: 'frame', title: 'Page frame', summary: 'Header, hero, pager and layout' },
  { slug: 'prose', title: 'Prose', summary: 'Help text and examples' },
  { slug: 'icons', title: 'Icons', summary: 'Every glyph, tone and size' },
] as const;

export type GalleryPageSlug = (typeof GALLERY_PAGES)[number]['slug'];

/**
 * The overlays the screenshot suite opens on the Overlays page, each by the
 * role and accessible name of the control that opens it.
 */
export const GALLERY_OVERLAYS = [
  { slug: 'task-dialog', role: 'button', trigger: 'Open task dialog' },
  { slug: 'picker', role: 'button', trigger: 'Open picker' },
  { slug: 'confirmation', role: 'button', trigger: 'Open confirmation' },
  { slug: 'field-dialog', role: 'button', trigger: 'Open field dialog' },
  { slug: 'rename-dialog', role: 'button', trigger: 'Open rename dialog' },
  { slug: 'notice-dialog', role: 'button', trigger: 'Open notice dialog' },
  { slug: 'sheet', role: 'button', trigger: 'Open sheet' },
  { slug: 'menu', role: 'button', trigger: 'Story actions' },
  { slug: 'dropdown', role: 'combobox', trigger: 'Pace' },
] as const;
