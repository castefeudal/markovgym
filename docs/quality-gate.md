# Release quality gate

1. npm ci and npm run quality: recursive syntax, deterministic CSS/view/runtime/document builds, budgets, unit and static contracts.
2. npm run e2e: Chromium desktop/mobile, Firefox and WebKit behavior/Axe; Chromium visual comparison against committed platform-specific baselines.
3. Review intentional visual changes. Ordinary CI never updates expectations automatically.
4. Push a branch and run Quality. Pages accepts only a successful Quality push run for the same main SHA.

The visual matrix has 200 cases across six viewport sizes, all themes and overlay/session/offline/boot states. Behavioral coverage includes migrations, IndexedDB authority, backup/import, media, translations, update lifecycle, session restoration, idempotent save and keyboard focus. Axe gates serious/critical violations; it complements human review.

Windows and Linux baselines are separate because font rasterization differs. Update local expectations deliberately with npx playwright test visual.spec.mjs --project=desktop --update-snapshots. The manual Quality input refresh_visual_baselines=true generates Linux expectations alongside the browser behavior/Axe matrix and uploads them for review; accept the artifact only after the entire workflow succeeds. This mode cannot deploy. Download, review and commit its artifact, then run normal Quality comparisons. Missing baselines fail ordinary CI.

If port 4173 is occupied, set MMG_E2E_PORT to a free port. Each browser context has isolated storage. Backup schema remains version 10; no data reset is required.

CI runs the four browser projects and visual matrix as separate jobs after the foundation gate. Pages still waits for the overall Quality conclusion and deploys its exact main push SHA.

Cold-start import tests deliberately pause optional catalog preloading. Import must load exercise references before validating a backup; if the catalog is unavailable, no data is changed. Preference persistence, import and rollback share a serialized writer so delayed edits cannot overwrite restored data. The service-worker update notice stays in document flow and is hidden during Run Mode; keyboard and file-picker checks verify that it cannot obstruct critical actions.
