# 0070 — Home, Library and Settings are tabs

Date: 2026-09-11
Status: Accepted

Amends [ADR 0069](0069-one-top-bar-per-screen.md), whose rejection of bottom navigation this
supersedes, and [ADR 0050](0050-the-library-wears-the-navigation.md), whose masthead this
supersedes: the standing line moves to Home, and the Library's utilities become tabs and a Help
icon on Home.

## Context

The Library did two jobs. It was the screen Monosai opens on, and it was the shelf of every saved
story. The two pull in different directions: the owner opens Monosai to start a new AI story far
more often than to re-read one, yet the start screen led with a shelf and kept both ways to start a
story behind one button that opened a menu.

ADR 0069 rejected a bottom navigation bar because Monosai had one home, a reader beneath it, and a
handful of pages visited rarely, and because a permanent bar would take the bottom edge the reader
gives to the docked audio player and the word and sentence sheets. It also said a destination
visited constantly would reopen the question. Splitting the start screen from the shelf creates
that destination: starting a story, finding a story, and changing a setting are three peers.

## Decision

### Three tabs, and only on their own pages

Monosai has three top-level destinations, **Home**, **Library** and **Settings**, in that order.
`/` opens Home; `/library` stays the shelf, so bookmarks and share redirects keep working.

Below the `$wide` breakpoint the tabs are a bar docked to the bottom edge of the viewport. At and
above it the same three tabs sit in the tab page's top bar. The breakpoint is `$wide` rather than
`$narrow` because the breakpoint set already gives docked placement to `$wide`, and because
between the two a top bar cannot hold the wordmark, three labelled tabs, and Help. Each tab is an
icon with a visible label at both widths: a tab names a place, and the repetition rule grants
silence only to controls pressed repeatedly within a session.

The tab bar appears only on the three tab pages, which declare themselves with route data
`tab: true`. The reader and every sub-page — Write with AI, Paste text, Help, Words and level and
the pages beneath it — keep their single bar with Back and have no tab bar. That is the answer to
ADR 0069's objection: the bottom edge on a phone belongs to the tabs only where there is no audio
player to dock and no sheet to rise.

### Still one bar per screen

`mn-main-nav` is one component with two placements. The shell renders the bottom placement after
`main` on a tab route and reserves its height at the foot of `main`, so the last row never sits
beneath it. Each tab page projects the top placement into its own `mn-page-header`. Each placement
is not displayed at the other's widths, so exactly one is drawn and exposed at a time, and each is
placed in the document where it is drawn: focus reaches the bottom bar after the page's content and
the top tabs within the page's bar. That keeps focus order and visual order the same at both
widths, which a single element moved between the top and the bottom by CSS could not do.

Rendering one bar in the shell above the outlet instead would have meant tab pages giving up
`mn-page-header`. Settings reached from Write with AI keeps its "Back to story", and that Back has
to share one bar with the tabs, which only the page's own header can offer.

On a wide screen the three tab pages wear the same bar, the way a website wears one header: the
Monosai mark and wordmark, the tabs at the bar's end, where a bar's controls go, then Help as an
icon-only control. Nothing in it changes from tab to tab, so nothing in it moves. Tabs centred in
the bar, with the brand and Help coming and going around them, were tried first and read as a
different header on each page.

Library and Settings show no visible title: the selected tab names the page. `mn-page-header`
takes `titleHidden`, which keeps `h1#mn-page-title` for the heading landmark and visually hides
it. Below `$wide` a bar left holding nothing visible takes no room.

Below `$wide` only Home's bar carries the mark, the wordmark and Help; the Library's and Settings'
bars hold nothing visible. The mark is not a link, because the Home tab already is one. Help's Back
returns to the tab page that opened it. The Library's labelled "Utilities" navigation is removed.

### Home starts stories

Home carries, in order:

1. The standing headline and illustration, moved from the Library. The headline is still a link,
   now to Words and level.
2. **Write with AI** (primary) and **Paste text**, side by side as direct links with no menu.
3. **Being written**: the generation rows the Library used to hold above its shelf.
4. **Continue reading**: one row for the most recently opened story.
5. **Your reading**: three figures — stories read, this week, characters read — and a streak
   calendar of the last sixteen weeks.

The words-known count is not a figure: the headline already says it. On the first run — no stories
and nothing being written — the introduction takes the place of Continue reading and Your reading.
Its "Paste Japanese text" choice is removed, because Paste text now stands directly above it.

### The Library holds stories

The Library is the shelf and nothing else: date groups, the All, Imported and Generated filters
always visible, and a Read or New marker on every row. It has no create button; one visible control
per action, and creating lives on Home. Renaming and deleting stay in each row's menu, and
virtualisation and scroll restoration are unchanged.

### Settings holds the words and the level

Settings becomes a tab, and its first row, already pointing at `/reading-level`, is named **Words
and level** with a summary such as `67 words · Starter forms · Anki`. The page it opens takes the
same name.

### Sample figures, until reading is recorded

Monosai records when a reading was last opened and nothing else about reading: no sessions, no
finished date. The owner chose to ship Home's layout now with placeholder figures rather than wait.
Every group showing one carries a **Sample** status pill: Your reading, and Continue reading's
progress line. The story Continue reading names is real — the reading with the latest
`lastOpenedAt`, found through the index that field already has. Neither group appears until a
story has been opened, so the first run shows no sample figures: someone who has read nothing must
not be told they have a streak.

The placeholders live in one presentation file, `features/home/sample-reading-progress.ts`, and
not in `domain/`: they describe no rule and no data. The arrangement is temporary. Recording
reading sessions and a finished date needs a new Dexie version and an upgrade, which this decision
does not make; when that lands, real values replace the placeholders without changing the layout,
and the pills go.

"Read" means the learner reached the end of a story. Until that is recorded, the Library's marker
uses the one fact it has as a stand-in: a story never opened is **New**, and an opened story is
**Read**.

## Consequences

- Home is one tap from wherever the tab bar is, and Settings becomes one tap rather than two from
  Home. Help is one tap from any tab page on a wide screen and from Home on a phone,
  and one Back from itself.
- Paste text, Write with AI and Help go back to Home. The reader pops to whichever tab page opened
  it and falls back to the Library for a deep link; its "Go to library" action at the end of a
  story is unchanged.
- ADR 0050's note that the standing line is load-bearing still holds, on Home; Settings' first row
  is the second door to the same page.
- The design system's rule that only what is still new is marked on the shelf is reversed: every
  row now says Read or New.
- Home is one column at every width, like every other page.
- Removing the Sample pills is part of the change that records reading; a pill left behind
  describes a figure that is no longer a sample.

## Alternatives considered

**Keep the Library as the start screen with two larger buttons.** Rejected: the screen would still
lead with a shelf the owner rarely uses, and the utilities would still be two taps from anywhere
else.

**Icon-only tabs.** Rejected. Tabs name places, and the repetition rule does not stretch to them;
labelled tabs are also the only way three peers read as peers.

**Hide Home's figures until they are real.** Rejected by the owner, who wanted the layout in use
now. The Sample pill is the price: every placeholder says what it is.
