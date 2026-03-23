# VR Mesh — Remaining Nits

From round 5 code review (2026-03-22). None are user-facing bugs — all are
edge-case robustness or minor polish.

## Important (edge-case robustness)

1. **`joinRoom()` stale event listeners** — If `replacePeer` is called mid-join (e.g.,
   timeout fires `becomeHost` while `on('open')` is pending), the old closure still
   captures the stale peer reference. PeerJS likely silences events on destroyed peers,
   but this relies on undocumented behavior. Consider adding a peer-generation counter
   or guard.

2. **`attemptHostHandoff` fallback error handling** — The fallback peer's error handler
   only logs. If the fallback also fails (network down), the user is stuck with no UI
   feedback. Consider surfacing a status message or re-showing the join screen.

## Suggestions

3. **`joinRetries` not reset on success** — Counter is only reset by button clicks and
   leave handler, not in `enterLobby()`. Harmless now but a defensive `joinRetries = 0`
   in `enterLobby` would be cleaner.

4. **Room history dropdown rebuilds on close** — Clicking the dropdown button when it's
   open rebuilds the list before toggling hidden. An early return when already visible
   would skip the unnecessary DOM rebuild.

5. **`showPIPDisconnected` inline background style leak** — Sets `background: #000` on
   PIP elements, cleared after 3s. If `exitVR` cancels the timeout, the inline style
   persists. Clear it in `exitVR` or `hidePIP`.

6. **Trailing blank line in `enterLobby()`** — Whitespace nit at the end of the function.
