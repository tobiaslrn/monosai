import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  EllipsisVertical,
  FileText,
  Info,
  Library,
  type LucideIconData,
  Menu,
  Merge,
  Plus,
  Scissors,
  Search,
  Settings,
  Sparkles,
  SpellCheck,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-angular';

/**
 * Semantic icon names used by the application, mapped to the bundled Lucide
 * set. Features refer to intent (`delete`, `back`) rather than to a specific
 * icon library, so the set can be replaced in one place.
 */
export const ICON_SET = {
  library: Library,
  add: Plus,
  generate: Sparkles,
  vocabulary: BookOpen,
  grammar: SpellCheck,
  settings: Settings,
  more: Menu,
  close: X,
  back: ArrowLeft,
  warning: CircleAlert,
  check: Check,
  delete: Trash2,
  file: FileText,
  search: Search,
  overflow: EllipsisVertical,
  split: Scissors,
  merge: Merge,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  upload: Upload,
  info: Info,
  aids: Type,
} as const satisfies Record<string, LucideIconData>;

export type IconName = keyof typeof ICON_SET;
