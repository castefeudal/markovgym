# Legacy artifact inventory

This records why old compatibility artifacts remain or were removed. Recheck each item before deleting it: some keys are still the only path that preserves data created by older releases.

| Artifact | Current role | Decision |
| --- | --- | --- |
| `legacy-base.html` | Standalone emergency screen linked from the boot error panel and copied to Pages. It lets a user reach the fallback when the application shell fails. | Keep and retain the link until a tested replacement fallback exists. |
| `setup.html` | Old, standalone ExerciseDB developer setup page. It was copied to production but had no application or documentation links. | Removed from source and Pages output as unrelated dead product surface. |
| `r2.payload.b64` | Opaque Base64/GZip-looking payload with no references from source, build, migration, or documentation; its compressed stream does not decode successfully. | Removed as an unconsumed and unreadable artifact. |
| Historical V7/V8/V10 stylesheet layers | Migrated into canonical styles/source owners; source order retained by sequence markers, redundant declarations removed. | Replaced by one generated app.css after build, contract and visual validation. Old color aliases are removed; compatibility DOM selectors remain. |
| `mmg_favorites_v7`, `mmg_current_workout_v1`, `mmg_lang_v1`, `mmg_theme_v7` | Older LocalStorage keys read by `migrate()` before normalized values are saved. | Keep until migration coverage and old-data support are intentionally retired. |
| `mmg.schema.v3`, `mmg.workoutSchema.v4`, `mmg.historySchema.v2` | Active migration/version markers written by the runtime. | Keep; these are not dead keys. |
| `legacy-base.html` embedded old copy | Fallback page contents are self-contained and not part of the active application bundle. | Keep as the production failure-path artifact; update its copy when product claims change. |

Pages packages `legacy-base.html` intentionally. It does not package removed development artifacts. The CSS split and every shipped shell resource are checked by the static quality suite and service-worker precache inventory.
