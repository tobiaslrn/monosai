@../AGENTS.md
@../docs/design/rules.md

# Starting work

- Always pull first: `git fetch`, then fast-forward the current branch (`git pull --ff-only`)
  before reading or changing anything.
- Start every new piece of work from an up-to-date `main`. This repository has no `develop`.
- Before pushing, fetch again. If `origin` moved, rebase unpushed commits onto it and rerun the
  checks rather than pushing over it.
