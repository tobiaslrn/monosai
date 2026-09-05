# 0051 — Non-reader utilities and first-use Help

Date: 2026-09-04
Status: Accepted; amends ADR 0050 and ADR 0025 outside the Reader

## Context

[ADR 0050](0050-the-library-wears-the-navigation.md) placed one labelled Settings
destination in the Library masthead. Learners also need a reliable way to find
onboarding and model guidance from every setup screen. The Reader must still
remain free of application navigation.

## Decision

The shell owns a shared bar on every non-reader route. It carries the Monosai
identity and icon-only Settings, Help, and GitHub links, with accessible names
and tooltips at every width. GitHub opens a new tab with opener isolation.
The Library removes its own masthead but retains its standing line.

Help is a lazy, static English page in `features/help`. It explains starting
paths, reader controls, AI cost and compatibility, audio limitations, and
practical generation guidance. It works locally without provider calls.

After successful bootstrap and a completed non-reader navigation, the shell
offers a compact, non-modal Help banner once. Reader deep links defer the offer until a
non-reader route is reached. Both buttons mark
`AppSettings.helpIntroSeen`; Read the guide also navigates to Help. The banner leaves focus where it is and never covers the Library. Failed preference writes offer a
retry without reopening the banner during the current shell lifetime.

Schema v9 adds the field transactionally to the existing app settings row with
`false`, preserving its other fields and all other rows. Missing rows use the
same default. Invalid data remains an error, never a reason to reset storage.
A full local data reset restores the introduction.

## Consequences

The design system now permits a utility navigation landmark and these three
icon-only destinations on non-reader screens, and a dedicated prose surface.
This replaces ADR 0050's labelled Settings masthead and no-navigation rule;
its standing line and empty Library behavior remain. ADR 0025's chrome-free
Reader remains in force. “Once” is scoped to the local database, not an account
or another device. Help content must stay aligned with the controls it teaches.
