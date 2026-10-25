# Documentation

The guide for using Monosai lives
[inside the application](https://tobiaslrn.github.io/monosai/#/help). It covers
setup, choosing models and voices, and what each error code means; it is written
for a learner, it works offline, and it is where the current advice is kept.

What is in this directory is for anyone changing the code.

| Page | What it covers |
| --- | --- |
| [Architecture](arc42/README.md) | The system as it is: layers, ports, persistence, deployment, quality goals |
| [Decisions](decisions/) | Why it is that way, one record per decision |
| [Design system](design/design-system.md) | The authority for structure, controls, colour, units, motion, voice, and state |
| [Mascot](design/mascot.md) | The mark and how it is used |
| [Android bridge](../android-bridge/README.md) | What the companion app is, how to install it, and how it is built |
| [AGENTS.md](../AGENTS.md) | Conventions for human and agent contributors |

The dependency licence report is generated at build time and is not committed:
`npm run licenses:build` writes it to `build/`.
