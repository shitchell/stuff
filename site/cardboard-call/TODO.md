# Cardboard Call — Remaining Nits

From round 5 code review (2026-03-22). None are bugs — all are minor polish.

## Suggestions

1. **`flipCamera` error recovery leaves no stream** — Old tracks are stopped before
   `getUserMedia` fails, so the catch block leaves the user with no video and no
   indication. Consider re-acquiring the original camera or calling `stopCamera()`.

2. **`startSender` retry doesn't clear `activeCalls`** — Stale call references from a
   previous peer could linger. Add `activeCalls = []` at the top of `startSender`.

3. **`emptyStream` variable naming** — Module-level `emptyStream` + function
   `createEmptyStream` is mildly confusing. Rename to `cachedEmptyStream`.

4. **`enterStereoView` reassigns event handlers** — Debug-only `on*` handlers are
   re-assigned via property assignment on each call. Not a bug (property assignment
   replaces), but could use `addEventListener` for consistency.

5. **`pagehide` doesn't clear timers** — `connectTimeout`, `pcCheckInterval`, and
   `scaleHideTimeout` aren't cleared. On bfcache restore, stale timers could fire.
