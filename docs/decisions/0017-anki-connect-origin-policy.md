# 0017 — What an opaque AnkiConnect failure is called

Date: 2026-08-19
Status: Accepted

## Context

`fetch` reports a refused connection, a rejected origin, and a request blocked
by Chrome's Private Network Access check identically: an opaque `TypeError` with
no status, no headers, and no reason. The connect client still has to name the
failure, because the recovery text differs sharply — "open Anki" and "allow this
address" and "use a package instead" are not interchangeable advice.

Milestone 5 resolved this by assuming that a non-local page reaching a local
address is stopped by a Private Network Access preflight, on the grounds that
AnkiConnect does not send `Access-Control-Allow-Private-Network`. Every non-local
origin was therefore reported as `private-network-blocked`, whose copy told the
learner the connection could not be made from here and to use a package.

Measuring the running add-on (AnkiConnect `2055492159`, Anki 25.x, config
`webCorsOriginList: ["http://localhost"]`) showed the assumption is wrong:

- **Every** preflight is answered `200` with
  `Access-Control-Allow-Private-Network: true`, whatever the origin —
  `http://localhost`, `http://127.0.0.1:4200`, a LAN address, and
  `https://example.github.io` alike. The add-on satisfies the PNA check; see
  `web.py` lines 171–175.
- An origin **outside** the allowlist is answered `403 Forbidden` with
  `Access-Control-Allow-Origin: http://localhost` — a mismatch, so the browser
  rejects the response during CORS and the page sees the opaque failure.
- `http://localhost` and `http://127.0.0.1:4200` are answered `200` with a
  matching allow-origin header: the add-on exempts loopback whenever
  `http://localhost` is allowed (`web.py` lines 236–240).

Driving the real vocabulary page at `http://127.0.0.1:4200` against this add-on
connected successfully and listed the real collection (10 decks, 24 note types).

So the failure a deployed page actually hits is the origin allowlist, which the
learner **can** fix, and Monosai was telling them it was unfixable.

## Decision

The client no longer infers a private-network block, and
`private-network-blocked` is removed from `AnkiErrorCode`. An opaque transport
failure is reported as `origin-not-allowed`, with the page's own origin as the
cause, whenever either holds:

- the page is not served from `http://localhost` or `http://127.0.0.1`, so it is
  outside AnkiConnect's default allowlist; or
- an endpoint has already answered in this session, so something is plainly
  listening and is now refusing.

Only a local page that has never had an answer is reported as `not-running` or
`bridge-not-running`. The package provider remains the escape on
`origin-not-allowed`, but the primary action is now to allow the address.

## Consequences

- The advice for the deployed application is correct and actionable: allow this
  page's address in AnkiConnect's config and restart Anki.
- A genuine PNA block — an older add-on without the header, or a browser policy
  that refuses regardless — is reported as `origin-not-allowed` instead. The
  wording covers it ("does not accept requests from the address this page is
  served from") and the package escape is still offered, but the name is
  imprecise for that case. Inventing a code the application has no evidence for
  is worse than one honest name, and nothing in a browser can distinguish them.
- The error list is 20 codes, not 21.

## What remains unverified

The measurements above are HTTP-level, plus one real browser run from
`http://127.0.0.1:4200`. A deployed **HTTPS** page reaching `127.0.0.1` in the
learner's own Chrome profile has not been observed — Chrome gates some PNA
behaviour on secure contexts, and a secure page may behave differently from the
loopback page tested here. The Android bridge has still only been exercised
against a fake and the shared contract. Both stay Milestone 10 compatibility
matrix items.
