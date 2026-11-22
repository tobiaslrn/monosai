---
name: design-review
description: Capture before/after screenshots of a visual or interactive change to Monosai and get it judged. Use before committing any change to a template, a style, a shared-ui primitive or UI copy.
---

# Design review

1. **Before you change anything**, from `web`: `npm run build:pages`, then
   `MONOSAI_SHOTS_DIR=test-results/shots-before npm run shots -- --grep <scenario>` for each
   affected screen. Scenarios are the test titles in `web/e2e-shots/`; add one there if the
   screen has none. (`npm run e2e` empties `test-results/`, so capture after it, not before.)
2. Make the change. Run `npm run design:check` and fix what it reports.
3. Rebuild (`npm run build:pages`), run `npm run shots -- --grep <scenario>` again, then
   `npm run shots:sheet` and open `test-results/shots/index.html`.
4. If you touched a primitive in `web/src/app/shared-ui/`, run `npm run visual` (needs Docker).
   A diff is expected only on that primitive's gallery page; any other diff is a regression.
   Never update baselines yourself: the owner runs the **Visual baselines** workflow.
5. Open the shots yourself, then spawn the `design-reviewer` agent with the before and after
   paths and a one-line summary of the change.
6. Fix everything it blocks on, then repeat from step 3. Commit only on **pass**, and say in the
   commit message which screens were checked.
