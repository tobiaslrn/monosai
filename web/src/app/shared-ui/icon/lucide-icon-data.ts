import type { LucideIconData } from '@lucide/angular';

/**
 * The drawing data of the Lucide icons the application uses, copied from the
 * library so that only these icons are bundled: importing the library's icon
 * components pulls a full Angular component, about three kilobytes, into the
 * first load for each icon. A unit test compares every entry with the installed
 * library, so an upgrade that redraws an icon fails there rather than going
 * unnoticed. Lucide is ISC licensed.
 */
export const LUCIDE_ICON_DATA = {
  ArrowDown: {
    name: 'arrow-down',
    size: 24,
    node: [
      ['path', { d: 'M12 5v14', key: 's699le' }],
      ['path', { d: 'm19 12-7 7-7-7', key: '1idqje' }],
    ],
  },
  ArrowLeft: {
    name: 'arrow-left',
    size: 24,
    node: [
      ['path', { d: 'm12 19-7-7 7-7', key: '1l729n' }],
      ['path', { d: 'M19 12H5', key: 'x3x0zl' }],
    ],
  },
  ArrowRight: {
    name: 'arrow-right',
    size: 24,
    node: [
      ['path', { d: 'M5 12h14', key: '1ays0h' }],
      ['path', { d: 'm12 5 7 7-7 7', key: 'xquz4c' }],
    ],
  },
  ArrowUp: {
    name: 'arrow-up',
    size: 24,
    node: [
      ['path', { d: 'm5 12 7-7 7 7', key: 'hav0vg' }],
      ['path', { d: 'M12 19V5', key: 'x0mq9r' }],
    ],
  },
  AudioLines: {
    name: 'audio-lines',
    size: 24,
    node: [
      ['path', { d: 'M2 10v3', key: '1fnikh' }],
      ['path', { d: 'M6 6v11', key: '11sgs0' }],
      ['path', { d: 'M10 3v18', key: 'yhl04a' }],
      ['path', { d: 'M14 8v7', key: '3a1oy3' }],
      ['path', { d: 'M18 5v13', key: '123xd1' }],
      ['path', { d: 'M22 10v3', key: '154ddg' }],
    ],
  },
  BookOpen: {
    name: 'book-open',
    size: 24,
    node: [
      ['path', { d: 'M12 5v16', key: '1f6ucr' }],
      [
        'path',
        {
          d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
          key: '1fyvmf',
        },
      ],
    ],
  },
  ChartNoAxesColumnIncreasing: {
    name: 'chart-no-axes-column-increasing',
    size: 24,
    node: [
      ['path', { d: 'M5 21v-6', key: '1hz6c0' }],
      ['path', { d: 'M12 21V9', key: 'uvy0l4' }],
      ['path', { d: 'M19 21V3', key: '11j9sm' }],
    ],
    aliases: ['bar-chart'],
  },
  Check: { name: 'check', size: 24, node: [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]] },
  ChevronDown: {
    name: 'chevron-down',
    size: 24,
    node: [['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]],
  },
  ChevronRight: {
    name: 'chevron-right',
    size: 24,
    node: [['path', { d: 'm9 18 6-6-6-6', key: 'mthhwq' }]],
  },
  ChevronUp: {
    name: 'chevron-up',
    size: 24,
    node: [['path', { d: 'm18 15-6-6-6 6', key: '153udz' }]],
  },
  ChevronsUpDown: {
    name: 'chevrons-up-down',
    size: 24,
    node: [
      ['path', { d: 'm7 15 5 5 5-5', key: '1hf1tw' }],
      ['path', { d: 'm7 9 5-5 5 5', key: 'sgt6xg' }],
    ],
  },
  CircleAlert: {
    name: 'circle-alert',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
      ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
      ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
    ],
    aliases: ['alert-circle'],
  },
  CircleCheck: {
    name: 'circle-check',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
      ['path', { d: 'm16 9-5.5 5.5L8 12', key: 'xofnsj' }],
    ],
    aliases: ['check-circle-2'],
  },
  CirclePause: {
    name: 'circle-pause',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
      ['line', { x1: '10', x2: '10', y1: '15', y2: '9', key: 'c1nkhi' }],
      ['line', { x1: '14', x2: '14', y1: '15', y2: '9', key: 'h65svq' }],
    ],
    aliases: ['pause-circle'],
  },
  CircleQuestionMark: {
    name: 'circle-question-mark',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
      ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', key: '1u773s' }],
      ['path', { d: 'M12 17h.01', key: 'p32p05' }],
    ],
    aliases: ['help-circle', 'circle-help'],
  },
  Copy: {
    name: 'copy',
    size: 24,
    node: [
      ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2', key: '17jyea' }],
      ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2', key: 'zix9uf' }],
    ],
  },
  CornerRightUp: {
    name: 'corner-right-up',
    size: 24,
    node: [
      ['path', { d: 'm10 9 5-5 5 5', key: '9ctzwi' }],
      ['path', { d: 'M4 20h7a4 4 0 0 0 4-4V4', key: '1plgdj' }],
    ],
  },
  Database: {
    name: 'database',
    size: 24,
    node: [
      ['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3', key: 'msslwz' }],
      ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5', key: '1wlel7' }],
      ['path', { d: 'M3 12A9 3 0 0 0 21 12', key: 'mv7ke4' }],
    ],
  },
  Dices: {
    name: 'dices',
    size: 24,
    node: [
      ['rect', { width: '12', height: '12', x: '2', y: '10', rx: '2', ry: '2', key: '6agr2n' }],
      [
        'path',
        {
          d: 'm17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6',
          key: '1o487t',
        },
      ],
      ['path', { d: 'M6 18h.01', key: 'uhywen' }],
      ['path', { d: 'M10 14h.01', key: 'ssrbsk' }],
      ['path', { d: 'M15 6h.01', key: 'cblpky' }],
      ['path', { d: 'M18 9h.01', key: '2061c0' }],
    ],
  },
  EllipsisVertical: {
    name: 'ellipsis-vertical',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '1', key: '41hilf' }],
      ['circle', { cx: '12', cy: '5', r: '1', key: 'gxeob9' }],
      ['circle', { cx: '12', cy: '19', r: '1', key: 'lyex9k' }],
    ],
    aliases: ['more-vertical'],
  },
  ExternalLink: {
    name: 'external-link',
    size: 24,
    node: [
      ['path', { d: 'M15 3h6v6', key: '1q9fwt' }],
      ['path', { d: 'M10 14 21 3', key: 'gplh6r' }],
      ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', key: 'a6xqqp' }],
    ],
  },
  Eye: {
    name: 'eye',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
          key: '1nclc0',
        },
      ],
      ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }],
    ],
  },
  EyeOff: {
    name: 'eye-off',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49',
          key: 'ct8e1f',
        },
      ],
      ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242', key: '151rxh' }],
      [
        'path',
        {
          d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
          key: '13bj9a',
        },
      ],
      ['path', { d: 'm2 2 20 20', key: '1ooewy' }],
    ],
  },
  FileText: {
    name: 'file-text',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
          key: '1oefj6',
        },
      ],
      ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5', key: 'wfsgrz' }],
      ['path', { d: 'M10 9H8', key: 'b1mrlr' }],
      ['path', { d: 'M16 13H8', key: 't4e002' }],
      ['path', { d: 'M16 17H8', key: 'z1uh3a' }],
    ],
  },
  GitFork: {
    name: 'git-fork',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '18', r: '3', key: '1mpf1b' }],
      ['circle', { cx: '6', cy: '6', r: '3', key: '1lh9wr' }],
      ['circle', { cx: '18', cy: '6', r: '3', key: '1h7g24' }],
      ['path', { d: 'M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9', key: '1uq4wg' }],
      ['path', { d: 'M12 12v3', key: '158kv8' }],
    ],
  },
  Info: {
    name: 'info',
    size: 24,
    node: [
      ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
      ['path', { d: 'M12 16v-4', key: '1dtifu' }],
      ['path', { d: 'M12 8h.01', key: 'e9boi3' }],
    ],
  },
  Languages: {
    name: 'languages',
    size: 24,
    node: [
      ['path', { d: 'm5 8 6 6', key: '1wu5hv' }],
      ['path', { d: 'm4 14 6-6 2-3', key: '1k1g8d' }],
      ['path', { d: 'M2 5h12', key: 'or177f' }],
      ['path', { d: 'M7 2h1', key: '1t2jsx' }],
      ['path', { d: 'm22 22-5-10-5 10', key: 'don7ne' }],
      ['path', { d: 'M14 18h6', key: '1m8k6r' }],
    ],
  },
  Library: {
    name: 'library',
    size: 24,
    node: [
      ['path', { d: 'm16 6 4 14', key: 'ji33uf' }],
      ['path', { d: 'M12 6v14', key: '1n7gus' }],
      ['path', { d: 'M8 8v12', key: '1gg7y9' }],
      ['path', { d: 'M4 4v16', key: '6qkkli' }],
    ],
  },
  List: {
    name: 'list',
    size: 24,
    node: [
      ['path', { d: 'M3 5h.01', key: '18ugdj' }],
      ['path', { d: 'M3 12h.01', key: 'nlz23k' }],
      ['path', { d: 'M3 19h.01', key: 'noohij' }],
      ['path', { d: 'M8 5h13', key: '1pao27' }],
      ['path', { d: 'M8 12h13', key: '1za7za' }],
      ['path', { d: 'M8 19h13', key: 'm83p4d' }],
    ],
  },
  ListChecks: {
    name: 'list-checks',
    size: 24,
    node: [
      ['path', { d: 'M13 5h8', key: 'a7qcls' }],
      ['path', { d: 'M13 12h8', key: 'h98zly' }],
      ['path', { d: 'M13 19h8', key: 'c3s6r1' }],
      ['path', { d: 'm3 17 2 2 4-4', key: '1jhpwq' }],
      ['path', { d: 'm3 7 2 2 4-4', key: '1obspn' }],
    ],
  },
  ListFilter: {
    name: 'list-filter',
    size: 24,
    node: [
      ['path', { d: 'M2 5h20', key: '1fs1ex' }],
      ['path', { d: 'M6 12h12', key: '8npq4p' }],
      ['path', { d: 'M9 19h6', key: '456am0' }],
    ],
  },
  ListStart: {
    name: 'list-start',
    size: 24,
    node: [
      ['path', { d: 'M3 5h6', key: '1ltk0q' }],
      ['path', { d: 'M3 12h13', key: 'ppymz1' }],
      ['path', { d: 'M3 19h13', key: 'bpdczq' }],
      ['path', { d: 'm16 8-3-3 3-3', key: '1pjpp6' }],
      ['path', { d: 'M21 19V7a2 2 0 0 0-2-2h-6', key: '4zzq67' }],
    ],
  },
  Menu: {
    name: 'menu',
    size: 24,
    node: [
      ['path', { d: 'M4 5h16', key: '1tepv9' }],
      ['path', { d: 'M4 12h16', key: '1lakjw' }],
      ['path', { d: 'M4 19h16', key: '1djgab' }],
    ],
  },
  Merge: {
    name: 'merge',
    size: 24,
    node: [
      ['path', { d: 'm8 6 4-4 4 4', key: 'ybng9g' }],
      ['path', { d: 'M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22', key: '1hyw0i' }],
      ['path', { d: 'm20 22-5-5', key: '1m27yz' }],
    ],
  },
  MessageSquareText: {
    name: 'message-square-text',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
          key: '18887p',
        },
      ],
      ['path', { d: 'M7 11h10', key: '1twpyw' }],
      ['path', { d: 'M7 15h6', key: 'd9of3u' }],
      ['path', { d: 'M7 7h8', key: 'af5zfr' }],
    ],
  },
  Pause: {
    name: 'pause',
    size: 24,
    node: [
      ['rect', { x: '14', y: '3', width: '5', height: '18', rx: '1', key: 'kaeet6' }],
      ['rect', { x: '5', y: '3', width: '5', height: '18', rx: '1', key: '1wsw3u' }],
    ],
  },
  Pencil: {
    name: 'pencil',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
          key: '1a8usu',
        },
      ],
      ['path', { d: 'm15 5 4 4', key: '1mk7zo' }],
    ],
  },
  Play: {
    name: 'play',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
          key: '10ikf1',
        },
      ],
    ],
  },
  Plus: {
    name: 'plus',
    size: 24,
    node: [
      ['path', { d: 'M5 12h14', key: '1ays0h' }],
      ['path', { d: 'M12 5v14', key: 's699le' }],
    ],
  },
  RefreshCw: {
    name: 'refresh-cw',
    size: 24,
    node: [
      ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', key: 'v9h5vc' }],
      ['path', { d: 'M21 3v5h-5', key: '1q7to0' }],
      ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', key: '3uifl3' }],
      ['path', { d: 'M8 16H3v5', key: '1cv678' }],
    ],
  },
  RotateCcw: {
    name: 'rotate-ccw',
    size: 24,
    node: [
      ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', key: '1357e3' }],
      ['path', { d: 'M3 3v5h5', key: '1xhq8a' }],
    ],
  },
  Scissors: {
    name: 'scissors',
    size: 24,
    node: [
      ['circle', { cx: '6', cy: '6', r: '3', key: '1lh9wr' }],
      ['path', { d: 'M8.12 8.12 12 12', key: '1alkpv' }],
      ['path', { d: 'M20 4 8.12 15.88', key: 'xgtan2' }],
      ['circle', { cx: '6', cy: '18', r: '3', key: 'fqmcym' }],
      ['path', { d: 'M14.8 14.8 20 20', key: 'ptml3r' }],
    ],
  },
  Search: {
    name: 'search',
    size: 24,
    node: [
      ['path', { d: 'm21 21-4.34-4.34', key: '14j7rj' }],
      ['circle', { cx: '11', cy: '11', r: '8', key: '4ej97u' }],
    ],
  },
  Settings: {
    name: 'settings',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
          key: '1i5ecw',
        },
      ],
      ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }],
    ],
  },
  SkipBack: {
    name: 'skip-back',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z',
          key: '15892j',
        },
      ],
      ['path', { d: 'M3 20V4', key: '1ptbpl' }],
    ],
  },
  SkipForward: {
    name: 'skip-forward',
    size: 24,
    node: [
      ['path', { d: 'M21 4v16', key: '7j8fe9' }],
      [
        'path',
        {
          d: 'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z',
          key: 'zs4d6',
        },
      ],
    ],
  },
  SlidersHorizontal: {
    name: 'sliders-horizontal',
    size: 24,
    node: [
      ['path', { d: 'M10 5H3', key: '1qgfaw' }],
      ['path', { d: 'M12 19H3', key: 'yhmn1j' }],
      ['path', { d: 'M14 3v4', key: '1sua03' }],
      ['path', { d: 'M16 17v4', key: '1q0r14' }],
      ['path', { d: 'M21 12h-9', key: '1o4lsq' }],
      ['path', { d: 'M21 19h-5', key: '1rlt1p' }],
      ['path', { d: 'M21 5h-7', key: '1oszz2' }],
      ['path', { d: 'M8 10v4', key: 'tgpxqk' }],
      ['path', { d: 'M8 12H3', key: 'a7s4jb' }],
    ],
  },
  Sparkles: {
    name: 'sparkles',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
          key: '1s2grr',
        },
      ],
      ['path', { d: 'M20 2v4', key: '1rf3ol' }],
      ['path', { d: 'M22 4h-4', key: 'gwowj6' }],
      ['circle', { cx: '4', cy: '20', r: '2', key: '6kqj1y' }],
    ],
    aliases: ['stars'],
  },
  SpellCheck: {
    name: 'spell-check',
    size: 24,
    node: [
      ['path', { d: 'm20 15-5.5 5.5L12 18', key: '6ytzne' }],
      ['path', { d: 'm4 16 6-12 5.115 10.23', key: 'fyukjg' }],
      ['path', { d: 'M6 12h8', key: '1hdiqa' }],
    ],
  },
  Square: {
    name: 'square',
    size: 24,
    node: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'afitv7' }]],
  },
  Star: {
    name: 'star',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
          key: 'r04s7s',
        },
      ],
    ],
  },
  Trash: {
    name: 'trash',
    size: 24,
    node: [
      ['path', { d: 'M10 11v6', key: 'nco0om' }],
      ['path', { d: 'M14 11v6', key: 'outv1u' }],
      ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', key: 'miytrc' }],
      ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
      ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', key: 'e791ji' }],
    ],
    aliases: ['trash-2'],
  },
  TriangleAlert: {
    name: 'triangle-alert',
    size: 24,
    node: [
      [
        'path',
        {
          d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
          key: 'wmoenq',
        },
      ],
      ['path', { d: 'M12 9v4', key: 'juzpu7' }],
      ['path', { d: 'M12 17h.01', key: 'p32p05' }],
    ],
    aliases: ['alert-triangle'],
  },
  Upload: {
    name: 'upload',
    size: 24,
    node: [
      ['path', { d: 'M12 3v12', key: '1x0j5s' }],
      ['path', { d: 'm17 8-5-5-5 5', key: '7q97r8' }],
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', key: 'ih7n3h' }],
    ],
  },
  X: {
    name: 'x',
    size: 24,
    node: [
      ['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
      ['path', { d: 'm6 6 12 12', key: 'd8bk6v' }],
    ],
  },
} as const satisfies Record<string, LucideIconData>;
