# VR Mesh — Design

**Date:** 2026-03-21
**Status:** Accepted

## Overview

A static page at `site/vr-mesh/` enabling a peer-to-peer mesh video call
where every peer can optionally share their camera. Each peer independently
chooses what to display in their stereoscopic VR view — a main stream and an
optional picture-in-picture (PIP) stream.

No backend required. PeerJS handles WebRTC signaling, self-hosted coturn on
shitchell.com handles TURN relay, both configurable via `config.json`.

## Use Cases

1. **Third-person mode**: A laptop is set up with a camera showing a room.
   Multiple people connect with their phones in VR headsets and see themselves
   from a weird external perspective.
2. **AR-ish mode**: Two people each share their phone's rear camera. Each sees
   their own camera as the main view (what they'd normally see with their eyes)
   with the other person's view as a small PIP overlay.

## File Structure

```
site/vr-mesh/
├── index.html          # Join screen, lobby, VR view
├── style.css           # Dark theme, mobile-first, stereo layout
├── app.js              # Mesh logic, PeerJS, stream management
├── config.json         # ICE servers, debug flag (gitignored)
└── config.example.json # Template for config.json
```

## Configuration

**`config.json`** (fetched on page load, falls back to STUN-only if missing):

```json
{
  "debug": true,
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:155.138.200.212:3478",
      "username": "cardboard",
      "credential": "cardboard2026"
    }
  ]
}
```

- `debug: true` enables `window.__logs` capture and the red "DBG" button with
  Refresh/Copy for on-device log inspection
- `debug: false` or config missing: no log interception, no debug UI
- `config.json` is gitignored; `config.example.json` is committed

## Join Flow

1. User opens page. Sees two inputs:
   - **Name**: text input, pre-filled from localStorage if returning. If empty,
     shows a fun auto-generated placeholder (e.g. "Blue Fox") that gets used if
     left blank. Saved to localStorage on join.
   - **Room**: combo input with dropdown arrow. Typing sets a custom room name
     (e.g. "the-bros"). Dropdown reveals room history from localStorage. If
     left empty, a randomly generated code placeholder (e.g. "ABCD-1234") is
     used. PeerJS peer IDs accept any string, so custom names work.
2. **"Join" button** — connects to the room.
3. No Create vs Join distinction. If nobody's in the room, you're first. If
   someone is, you join them.
4. URL param `?room=XXXX` pre-fills the room field (from QR code).

## Room Lobby

After joining, the join form is replaced by the lobby view:

- **Room header**: room name, your name, "Leave" button
- **Your camera**: "Share Camera" toggle. When active, shows preview and camera
  flip button (front/rear)
- **Peers panel**: list of connected peers with name and camera status. Peers
  sharing a camera show a small thumbnail.
- **View setup**:
  - "Main View" dropdown — all peers currently sharing cameras (including self).
    Disabled if nobody's sharing.
  - "PIP View" dropdown — same list plus "None". Disabled if < 2 streams.
  - "PIP Corner" — 4 small squares (TL, TR, BL, BR). Only shown when a PIP
    view is selected.
- **"Enter VR" button** — big, prominent, bottom. Disabled until main view is
  selected.

## Peer Mesh Architecture

### Connection Model

Every peer connects to every other peer. On join:

1. Create a PeerJS peer with a unique UUID
2. The room name is used as a "host" peer ID — the first person to join
   registers as the room name on PeerJS
3. The host relays the peer list to newcomers via data channel
4. Each newcomer calls every existing peer directly
5. If the host leaves, the next peer (by join order) re-registers as the room
   name so future joiners can still discover the room

### Per-Connection Channels

Each peer-to-peer connection carries:
- **Media stream** (optional) — camera feed, added/removed when toggling
  "Share Camera"
- **Data channel** — peer names, camera status, peer list relay

### Stream Management

- Toggle camera on → add video track to all active peer connections
- Toggle camera off → remove track from all connections
- Other peers see streams appear/disappear in their view dropdowns dynamically

## VR View

### Stereoscopic Main View

Same approach as cardboard-call: two side-by-side video elements showing the
same stream, filling the screen. CSS flexbox layout. Scale slider accessible
by tapping the screen.

### PIP Overlay

A small video element (~25% of each eye's width) positioned in the chosen
corner, duplicated for both eyes. Each eye's PIP is at the same relative
position within its half of the screen.

### Stream Switching

Cannot change streams from within VR. Exit VR (tap exit zone in top corner),
change selection in lobby, re-enter. Keeps VR view clean.

### Stream Loss

- **Main view** peer stops sharing or disconnects → centered message "Stream
  lost — [peer name] disconnected" on black background. User exits VR to pick
  a new stream.
- **PIP view** peer drops → PIP goes black with a disconnected icon (circle
  with slash) for 3 seconds, then PIP closes.

### Fullscreen & Orientation

Request fullscreen and `screen.orientation.lock('landscape')` on enter, release
on exit. Fail silently if unsupported.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PeerJS signaling unreachable | "Connection failed, try again" in lobby |
| Room peer not found (stale history) | You become first peer, "Waiting for peers..." |
| Camera permission denied | "Camera access needed", toggle stays off |
| Single camera device | Hide flip button |
| Host peer leaves | Next peer re-registers as room name |
| Host re-registration fails | New joiners see "Room not found", can retry |
| localStorage corrupted | Reset to defaults gracefully |

## localStorage Schema

- **Name**: `vr-mesh-name` — string
- **Room history**: `vr-mesh-rooms` — array of `{name, lastJoined}`, capped
  at 20 entries, oldest pruned

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate page from cardboard-call | Cardboard-call is stable; build new, replace later |
| No Create/Join distinction | Simpler UX — enter a room name and go |
| Opt-in camera sharing | Flexibility; laptop-on-table only needs one sharer |
| No in-VR stream switching | Fiddly in-headset UI is bad UX |
| Config file for ICE servers | Portable; anyone can fork and drop in their own TURN |
| Custom room names via PeerJS IDs | PeerJS accepts any string as peer ID |
| Equal peers, no host role | Host is only for discovery; no special permissions |
| Debug flag in config | Zero overhead when disabled; easy mobile debugging when on |
