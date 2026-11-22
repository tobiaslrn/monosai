---
name: design-review
description: Capture before/after screenshots of a visual or interactive change to Monosai and get it judged. Use before committing any change to a template, a style, a shared-ui primitive or UI copy.
---

# Design review

1. **Before you change anything**, from `web`: `npm run build:pages`, then
   `npm run shots -- --grep <scenario>` for each affected screen (scenarios are the test titles
   in `web/e2e-shots/`; add one there if the screen has none). Move `test-results/shots` to
   `test-results/shots-before`.
2. Make the change. Run `npm run design:check` and fix what it reports.
3. Rebuild (`npm run build:pages`), capture the same scenarios again, and run
   `npm run shots:sheet` to write the before/after contact sheet.
4. If you touched a primitive in `web/src/app/shared-ui/`, run `npm run visual`. A diff there is
   expected only for that primitive; any other diff is a regression. Never update baselines
   yourself: the owner runs the baseline workflow.
5. Open the shots yourself, then spawn the `design-reviewer` agent with the before and after
   paths and a one-line summary of the change.
6. Fix everything it blocks on, then repeat from step 3. Commit only on **pass**, and say in the
   commit message which screens were checked.
