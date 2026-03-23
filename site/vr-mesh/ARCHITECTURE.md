# VR Mesh -- Architecture

## Overview

VR Mesh is a static single-page application that creates a peer-to-peer video mesh using WebRTC. It lives at `site/vr-mesh/` in the `stuff` repository and is served via GitHub Pages. There is no backend -- signaling goes through PeerJS's cloud server, and media flows directly between peers.

### File Structure

```
site/vr-mesh/
  index.html          # Three sections: join-screen, lobby, vr-view
  style.css           # Dark theme, mobile-first, stereo layout
  app.js              # All application logic (~1100 lines)
  config.json         # ICE servers + debug flag (gitignored)
  config.example.json # Committed template for config.json
  TODO.md             # Known nits from code review
```

## Tech Stack

- **PeerJS 1.5.4** (CDN) -- WebRTC abstraction for signaling, data channels, and media connections
- **qrcodejs 1.0.0** (CDN) -- Client-side QR code generation
- **Vanilla JS** -- No framework, no build step
- **coturn** -- Self-hosted TURN server for NAT traversal (configured via `config.json`)

## Connection Architecture

### Host-Based Room Discovery

PeerJS requires a known peer ID to connect to. VR Mesh uses the room name itself as a peer ID for discovery:

1. The first person to join a room registers a PeerJS peer with `id = roomName`.
2. Subsequent joiners connect to `roomName` via a data channel.
3. The host sends back a `peer-list` message containing all current peers.
4. The newcomer then connects directly to every peer in the list.

The host has no special permissions -- it is only a discovery relay. All peers are equal once connected.

### Mesh Topology

Every peer maintains a direct connection to every other peer. Each peer-to-peer link consists of:

- A **data channel** (`DataConnection`) for metadata
- An optional **media channel** (`MediaConnection`) for camera streams

### Data Channel Messages

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `hello` | Joiner -> Host/Peer | `{ name, peerId, sharing }` | Self-introduction on connection open |
| `peer-list` | Host -> Joiner | `{ peers: [{ peerId, name, sharing }] }` | Full peer roster for mesh bootstrap |
| `new-peer` | Host -> All | `{ peerId, name }` | Notify existing peers of a newcomer |
| `peer-left` | Host/Peer -> All | `{ peerId }` | Notify peers of a departure |
| `camera-status` | Any -> All | `{ peerId, sharing }` | Camera toggled on/off |

### Host Handoff

When the host leaves (detected via `conn.on('close')`), the peer that had the host as `peerId === roomName` calls `attemptHostHandoff()`:

1. Destroy the current PeerJS peer.
2. Create a new peer with `id = roomName` (claiming the host slot).
3. If successful, reconnect to all known peers.
4. If `unavailable-id` error (someone else claimed it first), create an anonymous peer and reconnect normally.

The `becomingHost` flag prevents race conditions between the handoff and other join logic.

### The `replacePeer()` + `handleIncomingConnection()` Pattern

All PeerJS peer creation goes through `replacePeer()`, which:

1. Destroys the existing peer if any.
2. Creates a new `Peer` instance.
3. Registers `handleIncomingCall` and `handleIncomingConnection` listeners.

This exists because multiple code paths create peers (initial join, `becomeHost`, `attemptHostHandoff`, fallback). Before this centralization, each path set up listeners independently, leading to inconsistent handler registration and bugs where incoming connections were silently dropped.

`handleIncomingConnection()` is the single entry point for all incoming data connections. It handles every message type and manages connection lifecycle (close events, host broadcasting).

## State Management

### `peers` Map

```
Map<peerId, {
  name: string,
  conn: DataConnection | null,
  call: MediaConnection | null,
  stream: MediaStream | null,
  sharing: boolean
}>
```

Central source of truth for all connected peers. Updated by `addPeer()`, `removePeer()`, `applyStreamToPeer()`, and `handleCameraStatus()`. Every mutation triggers `updatePeerList()` and `updateViewDropdowns()` to keep the UI in sync.

### `pendingStreams` Buffer

```
Map<peerId, { stream: MediaStream, call: MediaConnection }>
```

Solves a race condition: media streams can arrive (via `call.on('stream')`) before the peer's `hello` message has been processed and the peer added to the `peers` map. When `applyStreamToPeer()` finds no entry in `peers`, it buffers the stream in `pendingStreams`. When `addPeer()` runs, it checks `pendingStreams` and applies any buffered stream.

### Key Flags

- **`joinedRoom`** (boolean): Set `true` in `enterLobby()`. Guards against duplicate lobby entry (e.g., if both the host response and a timeout fire). Reset on leave.
- **`becomingHost`** (boolean): Set `true` at the start of `becomeHost()`, cleared on open or error. Prevents the join timeout from triggering a second `becomeHost()` call while the first is still in progress.
- **`isHost`** (boolean): Whether this peer is registered as the room name. Controls whether `peer-list`, `new-peer`, and `peer-left` messages are broadcast.
- **`joinRetries`** (integer, max 5): Incremented on each `joinRoom()` call. Prevents infinite recursion when `becomeHost()` gets `unavailable-id` and retries as a joiner, which could loop if the room is in a broken state. Reset by button clicks and leave handler.

## VR View

### Fullscreen Target

Fullscreen is requested on `document.documentElement`, not on `#vr-view`. Requesting fullscreen on a specific element breaks video playback on some mobile browsers (the video elements lose their rendering surface). Using `documentElement` keeps the entire page in fullscreen and the videos play correctly.

### VR Controls as a Sibling

`#vr-controls` is a sibling of `#vr-view`, not a child. When an element enters fullscreen, a new stacking context is created. Children of the fullscreen element cannot escape this context, but siblings with a high `z-index` can render above it. `#vr-controls` uses `z-index: 2147483647` (max 32-bit int) to ensure it always floats above the fullscreen VR view.

The controls container (`#vr-controls`) is always present when VR is active, but the inner panel (`#vr-controls-inner`) with the exit button and scale slider toggles on tap. Auto-hides after 4 seconds.

### PIP Positioning

Each eye gets its own PIP element (`#vr-pip-left`, `#vr-pip-right`). The positioning math in `positionPIP()` places each PIP at the same relative position within its respective half of the screen:

- Left PIP is positioned within the left 50% (left eye's viewport).
- Right PIP is positioned within the right 50% (right eye's viewport).
- Corner selection (TL/TR/BL/BR) sets `top`/`bottom` and calculates `left`/`right` offsets with `calc(50% + margin)` to stay within the correct eye.

PIP width is 12.5% of total screen width (25% of each eye's half).

### Scale Slider

The scale slider transforms `#vr-view` itself (not the videos individually) using CSS `transform: scale()`. Range is 30% to 100%. This lets users shrink the view to match their headset's lens sweet spot.

### Wake Lock

The Wake Lock API (`navigator.wakeLock.request('screen')`) prevents the phone screen from dimming while in VR mode. The lock is released in `exitVR()`. Fails silently on unsupported browsers.

### Stream Loss Detection (`checkVRStreams`)

Called whenever a peer is removed (`removePeer()`). If VR is active:

- **Main stream lost**: Displays a centered overlay message ("Stream lost -- [name] disconnected"). The user must exit VR to select a new stream.
- **PIP stream lost**: PIP goes black for 3 seconds (`showPIPDisconnected()`), then auto-hides. `pipViewPeerId` is cleared.

## Camera Management

### Lifecycle

- **`startCamera()`**: Calls `getUserMedia`, sets `sharingCamera = true`, updates UI, calls all connected peers with the stream (or replaces the track if a call already exists), broadcasts `camera-status`.
- **`stopCamera()`**: Stops all tracks, clears `localStream`, resets UI, broadcasts `camera-status` with `sharing: false`.
- **`flipCamera()`**: Stops current tracks, requests new stream with opposite `facingMode`, replaces tracks on all active peer connections. If the new camera fails, re-acquires the old one. If that also fails, calls `stopCamera()`.

### `callPeerWithStream()` Helper

DRY helper that initiates a `myPeer.call()` with `localStream` and registers a `stream` listener on the returned call to apply the remote peer's stream. Used by `startCamera()`, `connectToPeer()`, `handleIncomingConnection()` (host calling new peer), and `attemptHostHandoff()`.

### `createEmptyStream()` Canvas Hack

PeerJS requires a `MediaStream` to initiate a call (its API is `peer.call(id, stream)`). When a peer doesn't have a camera but needs to establish a media connection (e.g., to receive another peer's stream), a 1x1 black canvas stream is created and cached in the module-level `emptyStream` variable.

### `broadcastCameraStatus()`

Sends a `camera-status` message to all connected peers via their data channels. Called after starting or stopping the camera.

## Configuration

`config.json` is fetched at startup in `loadConfig()`. The result is merged with defaults using spread:

```js
CONFIG = { ...CONFIG, ...await resp.json() };
```

Defaults: `{ debug: false, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }`.

If the fetch fails (file missing, network error), defaults are used silently.

- **`debug`** (boolean): When `true`, enables `window.__logs` capture (intercepts `console.log/error/warn`), shows the red "DBG" toggle button, and wires up Refresh/Copy buttons on the debug panel.
- **`iceServers`** (array): Passed directly to PeerJS as `config.iceServers`, which forwards them to the `RTCPeerConnection` constructor.

## Mobile Considerations

- **`interactive-widget=resizes-content`** in the viewport meta tag: Prevents the virtual keyboard from pushing content off-screen on Android.
- **`dvh` units / `inset: 0`**: `min-height: 100dvh` on body uses dynamic viewport height (accounts for mobile browser chrome). `#vr-view` uses `inset: 0` (shorthand for `top/right/bottom/left: 0`) for reliable fullscreen coverage.
- **`body.vr-active`**: Added when entering VR, removed when exiting. Zeroes body padding and hides overflow to prevent scroll bounce during VR.
- **Autoplay policy**: All video elements have `muted` and `playsinline` attributes. `muted` satisfies autoplay policies on mobile. `playsinline` prevents iOS from hijacking playback into a native fullscreen player.
- **Touch events in fullscreen**: Touch events on video elements inside a fullscreen container are unreliable on some mobile browsers. This is why `#vr-controls` is a sibling outside `#vr-view` rather than a child -- taps register reliably on the overlay div.

## Known Limitations

- **PeerJS cloud signaling**: The PeerJS cloud server (0.peerjs.com) is a single point of failure. If it goes down, no new connections can be established. Self-hosting a PeerJS server would eliminate this dependency.
- **TURN credentials in client-side code**: `config.json` contains TURN credentials that are visible to anyone who loads the page. This is acceptable for personal use but not for production deployments.
- **No end-to-end encryption**: WebRTC provides DTLS-SRTP encryption for media streams (peer-to-peer, not readable by the signaling server), but there is no additional application-layer encryption.
- **Room code collision**: Room codes have ~2.8 million combinations (23^4 * 10^4). If the room name collides with an existing PeerJS peer ID, `becomeHost` gets `unavailable-id` and retries as a joiner. Custom room names avoid this issue.
- **No in-VR stream switching**: Changing the main or PIP stream requires exiting VR, making the selection in the lobby, and re-entering. This is intentional -- in-headset UI is poor UX with basic Cardboard interaction.

## Debugging

### Debug Panel

Set `"debug": true` in `config.json` to enable the debug panel. A red "DBG" button appears in the top-right corner. Tapping it reveals a panel with:

- **Refresh**: Dumps `window.__logs` into the panel.
- **Copy**: Copies the full log to clipboard.

### `window.__logs`

An array (capped at 1000 entries) that captures all `console.log`, `console.error`, and `console.warn` output. Error messages are prefixed with `[ERR]`, warnings with `[WARN]`. Only active when `config.debug` is `true`.

### Log Tag Prefixes

All `console.log` calls use bracketed tag prefixes for filtering:

| Tag | Area |
|-----|------|
| `[CONFIG]` | Configuration loading |
| `[UI]` | Section visibility changes |
| `[JOIN]` | Room join flow |
| `[PEER]` | PeerJS peer lifecycle |
| `[HOST]` | Host registration and handoff |
| `[PEERS]` | Peer map add/remove |
| `[CALL]` | Media call lifecycle |
| `[STREAM]` | Stream application to peers |
| `[CAMERA]` | Camera start/stop/flip |
| `[VR]` | VR enter/exit/fullscreen |
| `[VR-CHECK]` | Stream loss detection |
| `[QR]` | QR code generation |
| `[LOBBY]` | Lobby entry/leave |
| `[EVENT]` | UI event handlers |
| `[FULLSCREEN]` | Fullscreen state changes |
