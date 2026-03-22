# VR Mesh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a peer mesh video call page where peers optionally share cameras and each peer picks a main + optional PIP view for stereoscopic VR display.

**Architecture:** Single-page app with three UI states (join, lobby, VR) managed by showing/hiding sections. PeerJS handles signaling via a "host" peer ID pattern. Each peer connects to every other peer with data channels for metadata and optional media streams. Config loaded from `config.json`.

**Tech Stack:** Vanilla HTML/CSS/JS, PeerJS (CDN), qrcodejs (CDN), self-hosted coturn TURN server

**Design doc:** `docs/plans/2026-03-21-vr-mesh-design.md`

---

### Task 1: Config, scaffold, and join screen HTML/CSS

**Files:**
- Create: `site/vr-mesh/index.html`
- Create: `site/vr-mesh/style.css`
- Create: `site/vr-mesh/app.js`
- Create: `site/vr-mesh/config.json`
- Create: `site/vr-mesh/config.example.json`

**Step 1: Create `config.example.json`**

```json
{
  "debug": true,
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:YOUR_TURN_SERVER:3478",
      "username": "YOUR_USERNAME",
      "credential": "YOUR_CREDENTIAL"
    }
  ]
}
```

**Step 2: Create `config.json` (gitignored — for local/deploy use)**

```json
{
  "debug": true,
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:155.138.200.212:3478" },
    {
      "urls": "turn:155.138.200.212:3478",
      "username": "cardboard",
      "credential": "cardboard2026"
    },
    {
      "urls": "turn:155.138.200.212:3478?transport=tcp",
      "username": "cardboard",
      "credential": "cardboard2026"
    }
  ]
}
```

**Step 3: Add `site/vr-mesh/config.json` to `.gitignore`**

Append `site/vr-mesh/config.json` to the project `.gitignore`.

**Step 4: Create `index.html`**

All three UI sections (join, lobby, VR) are defined here. Only the join section is visible initially.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, interactive-widget=resizes-content">
    <title>VR Mesh</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <!-- Join Screen -->
    <section id="join-screen">
        <h1>VR Mesh</h1>
        <p>Peer-to-peer VR video mesh</p>

        <div class="form-group">
            <label for="name-input">Your Name</label>
            <input type="text" id="name-input" autocomplete="off">
        </div>

        <div class="form-group">
            <label for="room-input">Room</label>
            <div class="combo-input">
                <input type="text" id="room-input" autocomplete="off">
                <button id="room-dropdown-btn" type="button">&#9660;</button>
            </div>
            <div id="room-history" class="hidden"></div>
        </div>

        <button id="btn-join" class="btn-primary">Join</button>
        <div id="join-status" class="status"></div>
    </section>

    <!-- Lobby -->
    <section id="lobby" class="hidden">
        <div id="lobby-header">
            <div>
                <span id="lobby-room-name" class="room-label"></span>
                <span id="lobby-your-name" class="name-label"></span>
            </div>
            <button id="btn-leave" class="btn-small">Leave</button>
        </div>

        <!-- Camera controls -->
        <div id="camera-controls">
            <button id="btn-share-camera" class="btn-toggle">Share Camera</button>
            <button id="btn-flip-camera" class="btn-small hidden">Flip</button>
        </div>
        <video id="camera-preview" class="hidden" autoplay playsinline muted></video>

        <!-- QR Code -->
        <div id="lobby-qr"></div>

        <!-- Peer list -->
        <div id="peer-list">
            <h3>Peers</h3>
            <div id="peers-container"></div>
        </div>

        <!-- View setup -->
        <div id="view-setup">
            <h3>View Setup</h3>
            <div class="form-group">
                <label for="main-view-select">Main View</label>
                <select id="main-view-select" disabled>
                    <option value="">No streams available</option>
                </select>
            </div>
            <div class="form-group">
                <label for="pip-view-select">PIP View</label>
                <select id="pip-view-select" disabled>
                    <option value="">None</option>
                </select>
            </div>
            <div id="pip-corner-picker" class="hidden">
                <label>PIP Corner</label>
                <div class="corner-grid">
                    <button class="corner-btn" data-corner="tl">TL</button>
                    <button class="corner-btn" data-corner="tr">TR</button>
                    <button class="corner-btn active" data-corner="bl">BL</button>
                    <button class="corner-btn" data-corner="br">BR</button>
                </div>
            </div>
        </div>

        <button id="btn-enter-vr" class="btn-primary" disabled>Enter VR</button>
    </section>

    <!-- VR View -->
    <section id="vr-view" class="hidden">
        <div id="vr-main">
            <video id="vr-left" autoplay playsinline muted></video>
            <video id="vr-right" autoplay playsinline muted></video>
        </div>
        <div id="vr-pip-left" class="vr-pip hidden">
            <video autoplay playsinline muted></video>
        </div>
        <div id="vr-pip-right" class="vr-pip hidden">
            <video autoplay playsinline muted></video>
        </div>
        <div id="vr-overlay" class="hidden">
            <div id="vr-overlay-msg"></div>
        </div>
        <div id="vr-scale-controls" class="hidden">
            <input type="range" id="vr-scale-slider" min="30" max="100" value="100" step="1">
        </div>
        <div id="vr-exit-zone">✕</div>
    </section>

    <!-- Debug panel (populated by JS if config.debug) -->
    <div id="debug-toggle" class="hidden">DBG</div>
    <div id="debug-panel" class="hidden">
        <button id="debug-refresh">Refresh</button>
        <button id="debug-copy">Copy</button>
        <pre id="debug-log"></pre>
    </div>

    <script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
    <script src="https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

**Step 5: Create `style.css`**

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #111;
    color: #e0e0e0;
    min-height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 2rem;
}

.hidden { display: none !important; }

/* --- Join Screen --- */
#join-screen {
    text-align: center;
    padding: 2rem;
    width: 100%;
    max-width: 400px;
}

#join-screen h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
}

#join-screen p {
    color: #888;
    margin-bottom: 2rem;
}

.form-group {
    text-align: left;
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    font-size: 0.9rem;
    color: #aaa;
    margin-bottom: 0.25rem;
}

.form-group input, .form-group select {
    width: 100%;
    font-size: 1.1rem;
    padding: 0.75rem;
    border: 2px solid #333;
    border-radius: 8px;
    background: #1a1a1a;
    color: #fff;
    font-family: inherit;
}

.form-group select {
    cursor: pointer;
}

/* Combo input (room field with dropdown arrow) */
.combo-input {
    display: flex;
}

.combo-input input {
    border-radius: 8px 0 0 8px;
    border-right: none;
    flex: 1;
}

.combo-input button {
    border: 2px solid #333;
    border-left: none;
    border-radius: 0 8px 8px 0;
    background: #222;
    color: #888;
    padding: 0 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
}

/* Room history dropdown */
#room-history {
    background: #1a1a1a;
    border: 2px solid #333;
    border-top: none;
    border-radius: 0 0 8px 8px;
    max-height: 150px;
    overflow-y: auto;
}

.room-history-item {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.room-history-item:hover {
    background: #252525;
}

.room-history-item .room-name { color: #fff; }
.room-history-item .room-date { color: #666; font-size: 0.75rem; }

/* Buttons */
.btn-primary {
    display: block;
    width: 100%;
    padding: 1rem;
    font-size: 1.2rem;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 600;
    background: #3498db;
    color: #fff;
    margin-top: 1rem;
}

.btn-primary:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
}

.btn-toggle {
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    border: 2px solid #555;
    border-radius: 8px;
    background: transparent;
    color: #fff;
    cursor: pointer;
}

.btn-toggle.active {
    background: #2ecc71;
    border-color: #2ecc71;
    color: #111;
}

.btn-small {
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    border: 1px solid #555;
    border-radius: 6px;
    background: transparent;
    color: #ccc;
    cursor: pointer;
}

/* Status */
.status {
    margin-top: 0.5rem;
    font-size: 0.9rem;
}

.status.waiting { color: #f1c40f; }
.status.connected { color: #2ecc71; }
.status.error { color: #e74c3c; }

/* --- Lobby --- */
#lobby {
    width: 100%;
    max-width: 500px;
    padding: 1rem;
}

#lobby-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
}

.room-label {
    font-weight: 700;
    font-size: 1.1rem;
    font-family: monospace;
}

.name-label {
    color: #888;
    margin-left: 0.75rem;
    font-size: 0.9rem;
}

#camera-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
}

#camera-preview {
    width: 100%;
    max-height: 200px;
    border-radius: 8px;
    background: #000;
    object-fit: cover;
    margin-bottom: 1rem;
}

#lobby-qr {
    text-align: center;
    margin-bottom: 1rem;
}

#peer-list {
    margin-bottom: 1rem;
}

#peer-list h3, #view-setup h3 {
    font-size: 0.95rem;
    color: #888;
    margin-bottom: 0.5rem;
}

.peer-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
}

.peer-name { flex: 1; }
.peer-status {
    font-size: 0.75rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
}

.peer-status.sharing { background: #2ecc71; color: #111; }
.peer-status.not-sharing { background: #333; color: #888; }

.peer-thumb {
    width: 48px;
    height: 36px;
    border-radius: 4px;
    object-fit: cover;
    background: #000;
}

/* View setup */
#view-setup {
    margin-bottom: 1rem;
}

.corner-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    width: 80px;
    margin-top: 0.25rem;
}

.corner-btn {
    padding: 0.3rem;
    font-size: 0.7rem;
    border: 1px solid #555;
    border-radius: 4px;
    background: transparent;
    color: #888;
    cursor: pointer;
}

.corner-btn.active {
    background: #3498db;
    border-color: #3498db;
    color: #fff;
}

/* --- VR View --- */
#vr-view {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
}

#vr-main {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
}

#vr-main video {
    width: 50%;
    height: 100%;
    object-fit: cover;
}

/* PIP */
.vr-pip {
    position: absolute;
    width: 12.5%;
    z-index: 5;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    overflow: hidden;
}

.vr-pip video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* PIP positioning — set by JS via data-corner and left/right eye */
#vr-pip-left { /* positioned within left 50% */ }
#vr-pip-right { /* positioned within right 50% */ }

/* VR overlay (stream lost message) */
#vr-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.85);
    z-index: 15;
}

#vr-overlay-msg {
    font-size: 1.5rem;
    color: #e74c3c;
    text-align: center;
    padding: 2rem;
}

/* Scale controls */
#vr-scale-controls {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: rgba(0, 0, 0, 0.6);
    padding: 8px 16px;
    border-radius: 12px;
}

#vr-scale-slider {
    width: 200px;
    height: 30px;
    cursor: pointer;
    accent-color: #3498db;
}

/* Exit zone */
#vr-exit-zone {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.2rem;
    cursor: pointer;
}

/* Debug panel */
#debug-toggle {
    position: fixed;
    top: 4px;
    right: 4px;
    z-index: 9999;
    background: rgba(255, 0, 0, 0.5);
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
}

#debug-panel {
    position: fixed;
    top: 28px;
    right: 4px;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.9);
    color: #0f0;
    font-size: 0.6rem;
    max-width: 90vw;
    max-height: 60vh;
    overflow: auto;
    padding: 8px;
    border-radius: 8px;
}

#debug-panel button {
    font-size: 0.7rem;
    margin-right: 4px;
    margin-bottom: 4px;
}

#debug-log {
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
}
```

**Step 6: Create `app.js` with config loading, debug setup, and section management**

```js
// --- Config & Debug ---
let CONFIG = { debug: false, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function loadConfig() {
    try {
        const resp = await fetch('config.json');
        if (resp.ok) {
            CONFIG = await resp.json();
            console.log('[CONFIG] Loaded:', JSON.stringify(CONFIG));
        } else {
            console.warn('[CONFIG] config.json not found, using defaults');
        }
    } catch (e) {
        console.warn('[CONFIG] Failed to load config.json, using defaults');
    }

    if (CONFIG.debug) {
        enableDebug();
    }
}

function enableDebug() {
    window.__logs = [];
    const _log = console.log, _err = console.error, _warn = console.warn;
    console.log = (...a) => { const m = a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); _log.apply(console, a); };
    console.error = (...a) => { const m = '[ERR] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); _err.apply(console, a); };
    console.warn = (...a) => { const m = '[WARN] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); _warn.apply(console, a); };

    const toggle = document.getElementById('debug-toggle');
    const panel = document.getElementById('debug-panel');
    toggle.classList.remove('hidden');
    toggle.addEventListener('click', () => panel.classList.toggle('hidden'));
    document.getElementById('debug-refresh').addEventListener('click', () => {
        document.getElementById('debug-log').textContent = window.__logs.join('\n');
    });
    document.getElementById('debug-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(window.__logs.join('\n')).then(() => alert('Copied!'));
    });
}

// --- DOM helpers ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const joinScreen = $('#join-screen');
const lobby = $('#lobby');
const vrView = $('#vr-view');

function showSection(section) {
    [joinScreen, lobby, vrView].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

// --- Fun name generator ---
const ADJECTIVES = ['Red', 'Blue', 'Green', 'Gold', 'Silver', 'Swift', 'Bold', 'Calm', 'Wild', 'Bright'];
const ANIMALS = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Lynx', 'Crow', 'Deer', 'Hare', 'Pike'];

function generateFunName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return adj + ' ' + animal;
}

function generateRoomCode() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
    return code;
}

// --- localStorage ---
const LS_NAME_KEY = 'vr-mesh-name';
const LS_ROOMS_KEY = 'vr-mesh-rooms';

function loadName() {
    try { return localStorage.getItem(LS_NAME_KEY) || ''; } catch { return ''; }
}

function saveName(name) {
    try { localStorage.setItem(LS_NAME_KEY, name); } catch {}
}

function loadRoomHistory() {
    try {
        const data = localStorage.getItem(LS_ROOMS_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveRoomToHistory(roomName) {
    const history = loadRoomHistory().filter(r => r.name !== roomName);
    history.unshift({ name: roomName, lastJoined: new Date().toISOString() });
    if (history.length > 20) history.length = 20;
    try { localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(history)); } catch {}
}

// --- Init ---
async function init() {
    await loadConfig();

    // Populate name input
    const nameInput = $('#name-input');
    const savedName = loadName();
    if (savedName) {
        nameInput.value = savedName;
    } else {
        nameInput.placeholder = generateFunName();
    }

    // Populate room input placeholder
    $('#room-input').placeholder = generateRoomCode();

    // URL param prefill
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        $('#room-input').value = roomParam;
    }

    // Room history dropdown
    setupRoomHistory();
}

function setupRoomHistory() {
    const btn = $('#room-dropdown-btn');
    const historyEl = $('#room-history');
    const input = $('#room-input');

    btn.addEventListener('click', () => {
        const history = loadRoomHistory();
        if (history.length === 0) return;

        historyEl.innerHTML = '';
        history.forEach(r => {
            const item = document.createElement('div');
            item.className = 'room-history-item';
            const date = new Date(r.lastJoined);
            const dateStr = date.toLocaleDateString();
            item.innerHTML = `<span class="room-name">${r.name}</span><span class="room-date">${dateStr}</span>`;
            item.addEventListener('click', () => {
                input.value = r.name;
                historyEl.classList.add('hidden');
            });
            historyEl.appendChild(item);
        });
        historyEl.classList.toggle('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.combo-input') && !e.target.closest('#room-history')) {
            historyEl.classList.add('hidden');
        }
    });
}

init();
```

**Step 7: Verify in browser**

Open `site/vr-mesh/index.html` via local server. Confirm:
- Dark theme, join screen visible with name and room inputs
- Name placeholder shows a fun name
- Room placeholder shows a random code
- Room dropdown button exists (empty history)
- Debug button appears if config.debug is true

**Step 8: Commit**

```bash
git add site/vr-mesh/ .gitignore
git commit -m "feat(vr-mesh): scaffold HTML/CSS/JS with config, join screen, and debug support"
```

---

### Task 2: Join button, PeerJS room connection, and lobby transition

**Files:**
- Modify: `site/vr-mesh/app.js`

**Step 1: Add state variables and join logic**

Add after the localStorage functions, before `init()`:

```js
// --- State ---
let myPeer = null;
let myName = '';
let roomName = '';
let localStream = null;
let currentFacingMode = 'environment';
let sharingCamera = false;
let isHost = false;

// peers map: peerId -> { name, conn (DataConnection), call (MediaConnection), stream, sharing }
const peers = new Map();

// View state
let mainViewPeerId = null;
let pipViewPeerId = null;
let pipCorner = 'bl';
```

**Step 2: Add joinRoom function**

```js
async function joinRoom() {
    const nameInput = $('#name-input');
    const roomInput = $('#room-input');
    const statusEl = $('#join-status');

    myName = nameInput.value.trim() || nameInput.placeholder;
    roomName = roomInput.value.trim() || roomInput.placeholder;

    console.log('[JOIN] Joining room:', roomName, 'as:', myName);
    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status waiting';

    saveName(myName);
    saveRoomToHistory(roomName);

    // Create our peer with a unique ID
    myPeer = new Peer(undefined, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', (myId) => {
        console.log('[PEER] My peer ID:', myId);

        // Try to connect to the room host
        const hostConn = myPeer.connect(roomName, { reliable: true });

        hostConn.on('open', () => {
            console.log('[JOIN] Connected to room host');
            // Send our name
            hostConn.send({ type: 'hello', name: myName, peerId: myId });
        });

        hostConn.on('data', (data) => {
            console.log('[JOIN] Received from host:', JSON.stringify(data));
            if (data.type === 'peer-list') {
                // Connect to all existing peers
                data.peers.forEach(p => {
                    if (p.peerId !== myId) {
                        connectToPeer(p.peerId, p.name);
                    }
                });
                enterLobby();
            }
        });

        hostConn.on('error', (err) => {
            console.log('[JOIN] Could not reach host, becoming host. Error:', err);
            becomeHost(myId);
        });

        // Timeout: if host doesn't respond, become host
        setTimeout(() => {
            if (!lobby.classList.contains('hidden')) return; // already in lobby
            if (hostConn.open) return; // connection is open, waiting for data
            console.log('[JOIN] Host connection timeout, becoming host');
            becomeHost(myId);
        }, 5000);
    });

    myPeer.on('error', (err) => {
        console.error('[PEER] Error:', err.type, err);
        if (err.type === 'peer-unavailable') {
            // Room doesn't exist yet — become host
            console.log('[JOIN] Room not found, becoming host');
            becomeHost(myPeer.id);
        } else {
            statusEl.textContent = 'Connection failed. Try again.';
            statusEl.className = 'status error';
        }
    });
}

function becomeHost(myId) {
    console.log('[HOST] Becoming host for room:', roomName);
    isHost = true;

    // Destroy current peer and recreate with room name as ID
    myPeer.destroy();
    myPeer = new Peer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Registered as room:', roomName);
        setupHostListeners();
        enterLobby();
    });

    myPeer.on('error', (err) => {
        console.error('[HOST] Error:', err.type, err);
        if (err.type === 'unavailable-id') {
            // Someone else took the room name — try joining again
            console.log('[HOST] Room taken, retrying as joiner');
            isHost = false;
            joinRoom();
        } else {
            $('#join-status').textContent = 'Connection failed. Try again.';
            $('#join-status').className = 'status error';
        }
    });
}

function setupHostListeners() {
    // Listen for incoming connections (joiners)
    myPeer.on('connection', (conn) => {
        console.log('[HOST] Incoming connection from:', conn.peer);

        conn.on('data', (data) => {
            if (data.type === 'hello') {
                console.log('[HOST] Peer introduced:', data.name, data.peerId);
                // Add to our peer list
                addPeer(data.peerId, data.name, conn);

                // Send them the full peer list (including us)
                const peerList = [
                    { peerId: myPeer.id, name: myName },
                    ...Array.from(peers.entries()).map(([id, p]) => ({
                        peerId: id, name: p.name
                    }))
                ];
                conn.send({ type: 'peer-list', peers: peerList });

                // Notify all existing peers about the newcomer
                peers.forEach((p, id) => {
                    if (id !== data.peerId && p.conn && p.conn.open) {
                        p.conn.send({ type: 'new-peer', peerId: data.peerId, name: data.name });
                    }
                });
            }
        });
    });

    // Also listen for media calls
    myPeer.on('call', handleIncomingCall);
}

function enterLobby() {
    console.log('[LOBBY] Entering lobby');
    showSection(lobby);
    $('#lobby-room-name').textContent = roomName;
    $('#lobby-your-name').textContent = myName;
    generateRoomQR();
    updatePeerList();
    updateViewDropdowns();

    // Listen for incoming connections and calls (both host and non-host)
    if (!isHost) {
        myPeer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data.type === 'hello') {
                    addPeer(data.peerId, data.name, conn);
                } else if (data.type === 'new-peer') {
                    connectToPeer(data.peerId, data.name);
                } else if (data.type === 'camera-status') {
                    handleCameraStatus(data);
                } else if (data.type === 'peer-left') {
                    removePeer(data.peerId);
                }
            });
        });
        myPeer.on('call', handleIncomingCall);
    }
}

function generateRoomQR() {
    const container = $('#lobby-qr');
    container.innerHTML = '';
    const baseUrl = window.location.origin + window.location.pathname;
    const url = baseUrl + '?room=' + encodeURIComponent(roomName);
    try {
        new QRCode(container, {
            text: url, width: 160, height: 160,
            colorDark: '#ffffff', colorLight: '#111111',
        });
    } catch (err) {
        console.error('[QR] Error:', err);
    }
}
```

**Step 3: Add peer management functions**

```js
function addPeer(peerId, name, conn) {
    if (peers.has(peerId)) return;
    console.log('[PEERS] Adding peer:', name, peerId);
    peers.set(peerId, { name, conn, call: null, stream: null, sharing: false });
    updatePeerList();
    updateViewDropdowns();
}

function removePeer(peerId) {
    console.log('[PEERS] Removing peer:', peerId);
    const peer = peers.get(peerId);
    if (peer) {
        if (peer.conn) peer.conn.close();
        if (peer.call) peer.call.close();
    }
    peers.delete(peerId);
    updatePeerList();
    updateViewDropdowns();
}

function connectToPeer(peerId, name) {
    console.log('[PEERS] Connecting to peer:', name, peerId);
    const conn = myPeer.connect(peerId, { reliable: true });

    conn.on('open', () => {
        console.log('[PEERS] Data connection open to:', name);
        conn.send({ type: 'hello', name: myName, peerId: myPeer.id });
        addPeer(peerId, name, conn);

        conn.on('data', (data) => {
            if (data.type === 'camera-status') {
                handleCameraStatus(data);
            } else if (data.type === 'new-peer') {
                connectToPeer(data.peerId, data.name);
            } else if (data.type === 'peer-left') {
                removePeer(data.peerId);
            }
        });
    });

    conn.on('close', () => {
        console.log('[PEERS] Connection closed to:', name);
        removePeer(peerId);
    });
}

function handleIncomingCall(call) {
    console.log('[CALL] Incoming call from:', call.peer);

    // Answer with our stream if sharing, otherwise empty stream
    const stream = sharingCamera ? localStream : createEmptyStream();
    call.answer(stream);

    call.on('stream', (remoteStream) => {
        console.log('[CALL] Received stream from:', call.peer);
        const peer = peers.get(call.peer);
        if (peer) {
            peer.stream = remoteStream;
            peer.call = call;
            updatePeerList();
            updateViewDropdowns();
        }
    });

    call.on('close', () => {
        console.log('[CALL] Call closed from:', call.peer);
    });
}

function handleCameraStatus(data) {
    console.log('[PEERS] Camera status update:', data.peerId, data.sharing);
    const peer = peers.get(data.peerId);
    if (peer) {
        peer.sharing = data.sharing;
        updatePeerList();
        updateViewDropdowns();
    }
}

let emptyStream = null;
function createEmptyStream() {
    if (emptyStream) return emptyStream;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    emptyStream = canvas.captureStream(0);
    return emptyStream;
}
```

**Step 4: Add UI update functions (stubs for now)**

```js
function updatePeerList() {
    const container = $('#peers-container');
    container.innerHTML = '';

    if (peers.size === 0) {
        container.innerHTML = '<div style="color:#666">Waiting for peers...</div>';
        return;
    }

    peers.forEach((peer, id) => {
        const item = document.createElement('div');
        item.className = 'peer-item';
        item.innerHTML = `
            <span class="peer-name">${peer.name}</span>
            <span class="peer-status ${peer.sharing ? 'sharing' : 'not-sharing'}">
                ${peer.sharing ? 'Sharing' : 'Not sharing'}
            </span>
        `;
        if (peer.sharing && peer.stream) {
            const thumb = document.createElement('video');
            thumb.className = 'peer-thumb';
            thumb.srcObject = peer.stream;
            thumb.autoplay = true;
            thumb.muted = true;
            thumb.playsInline = true;
            item.appendChild(thumb);
        }
        container.appendChild(item);
    });
}

function updateViewDropdowns() {
    const mainSelect = $('#main-view-select');
    const pipSelect = $('#pip-view-select');
    const currentMain = mainSelect.value;
    const currentPip = pipSelect.value;

    // Collect all sharing peers (including self if sharing)
    const sources = [];
    if (sharingCamera && localStream) {
        sources.push({ id: 'self', name: myName + ' (you)' });
    }
    peers.forEach((peer, id) => {
        if (peer.sharing && peer.stream) {
            sources.push({ id, name: peer.name });
        }
    });

    // Update main view dropdown
    mainSelect.innerHTML = '';
    if (sources.length === 0) {
        mainSelect.innerHTML = '<option value="">No streams available</option>';
        mainSelect.disabled = true;
    } else {
        mainSelect.innerHTML = '<option value="">Select a stream...</option>';
        sources.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (s.id === currentMain) opt.selected = true;
            mainSelect.appendChild(opt);
        });
        mainSelect.disabled = false;
    }

    // Update PIP dropdown
    pipSelect.innerHTML = '<option value="">None</option>';
    if (sources.length >= 2) {
        sources.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (s.id === currentPip) opt.selected = true;
            pipSelect.appendChild(opt);
        });
        pipSelect.disabled = false;
    } else {
        pipSelect.disabled = true;
    }

    // Update Enter VR button
    $('#btn-enter-vr').disabled = !mainSelect.value;

    // Show/hide PIP corner picker
    $('#pip-corner-picker').classList.toggle('hidden', !pipSelect.value);
}
```

**Step 5: Wire up event listeners**

Add at the bottom of `app.js`, before `init();`:

```js
// --- Event Listeners ---
$('#btn-join').addEventListener('click', joinRoom);
$('#room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});

$('#btn-leave').addEventListener('click', () => {
    console.log('[LOBBY] Leaving room');
    if (myPeer) myPeer.destroy();
    peers.clear();
    myPeer = null;
    isHost = false;
    sharingCamera = false;
    localStream = null;
    showSection(joinScreen);
});

$('#main-view-select').addEventListener('change', () => {
    mainViewPeerId = $('#main-view-select').value || null;
    $('#btn-enter-vr').disabled = !mainViewPeerId;
});

$('#pip-view-select').addEventListener('change', () => {
    pipViewPeerId = $('#pip-view-select').value || null;
    $('#pip-corner-picker').classList.toggle('hidden', !pipViewPeerId);
});

$$('.corner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.corner-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pipCorner = btn.dataset.corner;
    });
});
```

**Step 6: Verify in browser**

Open two tabs. Tab 1: type a room name, click Join → should enter lobby with "Waiting for peers...". Tab 2: type same room name, click Join → both should see each other in the peer list.

**Step 7: Commit**

```bash
git add site/vr-mesh/app.js
git commit -m "feat(vr-mesh): add PeerJS mesh connection, room join, and lobby UI"
```

---

### Task 3: Camera sharing and stream distribution

**Files:**
- Modify: `site/vr-mesh/app.js`

**Step 1: Add camera sharing functions**

Add after `createEmptyStream`:

```js
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: false
        });
        console.log('[CAMERA] Camera started');
        $('#camera-preview').srcObject = localStream;
        $('#camera-preview').classList.remove('hidden');
        sharingCamera = true;
        $('#btn-share-camera').classList.add('active');
        $('#btn-share-camera').textContent = 'Stop Sharing';

        await checkCameraCount();

        // Call all connected peers to send them our stream
        peers.forEach((peer, id) => {
            console.log('[CAMERA] Calling peer:', peer.name);
            const call = myPeer.call(id, localStream);
            peer.call = call;

            call.on('stream', (remoteStream) => {
                console.log('[CAMERA] Received stream back from:', peer.name);
                peer.stream = remoteStream;
                updatePeerList();
                updateViewDropdowns();
            });
        });

        // Notify peers of camera status
        broadcastCameraStatus(true);
        updateViewDropdowns();
    } catch (err) {
        console.error('[CAMERA] Error:', err);
        $('#join-status').textContent = 'Camera access needed.';
        $('#join-status').className = 'status error';
    }
}

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    sharingCamera = false;
    $('#camera-preview').classList.add('hidden');
    $('#camera-preview').srcObject = null;
    $('#btn-share-camera').classList.remove('active');
    $('#btn-share-camera').textContent = 'Share Camera';
    $('#btn-flip-camera').classList.add('hidden');

    broadcastCameraStatus(false);
    updateViewDropdowns();
}

async function flipCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: false
        });
        $('#camera-preview').srcObject = localStream;

        // Replace track on all active calls
        const newTrack = localStream.getVideoTracks()[0];
        peers.forEach((peer) => {
            if (peer.call && peer.call.peerConnection) {
                const sender = peer.call.peerConnection.getSenders()
                    .find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack);
            }
        });
    } catch (err) {
        console.error('[CAMERA] Flip failed:', err);
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    }
}

async function checkCameraCount() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        if (cameras.length >= 2) {
            $('#btn-flip-camera').classList.remove('hidden');
        }
    } catch {}
}

function broadcastCameraStatus(sharing) {
    const msg = { type: 'camera-status', peerId: myPeer.id, sharing };
    peers.forEach((peer) => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send(msg);
        }
    });
}
```

**Step 2: Wire up camera buttons**

Add to the event listeners section:

```js
$('#btn-share-camera').addEventListener('click', () => {
    if (sharingCamera) {
        stopCamera();
    } else {
        startCamera();
    }
});

$('#btn-flip-camera').addEventListener('click', flipCamera);
```

**Step 3: Verify**

Two tabs, same room. Tab 1 clicks "Share Camera" → preview appears, Tab 2 sees Tab 1 listed as "Sharing" with thumbnail. View dropdowns update.

**Step 4: Commit**

```bash
git add site/vr-mesh/app.js
git commit -m "feat(vr-mesh): add camera sharing with stream distribution to all peers"
```

---

### Task 4: VR view with main stream and PIP

**Files:**
- Modify: `site/vr-mesh/app.js`

**Step 1: Add VR enter/exit functions**

```js
function getStreamForPeer(peerId) {
    if (peerId === 'self') return localStream;
    const peer = peers.get(peerId);
    return peer ? peer.stream : null;
}

function enterVR() {
    const mainStream = getStreamForPeer(mainViewPeerId);
    if (!mainStream) {
        console.warn('[VR] No main stream available');
        return;
    }

    console.log('[VR] Entering VR, main:', mainViewPeerId, 'pip:', pipViewPeerId);
    showSection(vrView);

    // Main view
    $('#vr-left').srcObject = mainStream;
    $('#vr-right').srcObject = mainStream;
    $('#vr-left').play().catch(() => {});
    $('#vr-right').play().catch(() => {});

    // PIP view
    if (pipViewPeerId) {
        const pipStream = getStreamForPeer(pipViewPeerId);
        if (pipStream) {
            showPIP(pipStream);
        }
    }

    // Fullscreen
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }

    // Landscape lock
    try { screen.orientation.lock('landscape').catch(() => {}); } catch {}
}

function showPIP(stream) {
    const pipL = $('#vr-pip-left');
    const pipR = $('#vr-pip-right');

    pipL.querySelector('video').srcObject = stream;
    pipR.querySelector('video').srcObject = stream;
    pipL.querySelector('video').play().catch(() => {});
    pipR.querySelector('video').play().catch(() => {});

    positionPIP(pipCorner);
    pipL.classList.remove('hidden');
    pipR.classList.remove('hidden');
}

function hidePIP() {
    $('#vr-pip-left').classList.add('hidden');
    $('#vr-pip-right').classList.add('hidden');
}

function positionPIP(corner) {
    const pipL = $('#vr-pip-left');
    const pipR = $('#vr-pip-right');
    const margin = '2%';
    const pipW = '12.5%'; // 25% of each eye's 50% = 12.5% of full width

    // Reset all positioning
    [pipL, pipR].forEach(el => {
        el.style.top = el.style.bottom = el.style.left = el.style.right = 'auto';
    });

    // Left eye PIP: positioned within left 50% of screen
    // Right eye PIP: positioned within right 50% of screen
    const positions = {
        tl: { top: margin, eyeNear: margin },
        tr: { top: margin, eyeFar: margin },
        bl: { bottom: margin, eyeNear: margin },
        br: { bottom: margin, eyeFar: margin },
    };

    const pos = positions[corner];

    // Vertical position
    if (pos.top) { pipL.style.top = pos.top; pipR.style.top = pos.top; }
    if (pos.bottom) { pipL.style.bottom = pos.bottom; pipR.style.bottom = pos.bottom; }

    // Horizontal: "eyeNear" = near center divider, "eyeFar" = near outer edge
    if (pos.eyeNear) {
        // Near center: left eye = right side of left half, right eye = left side of right half
        pipL.style.right = `calc(50% + ${margin})`;
        pipR.style.left = `calc(50% + ${margin})`;
    }
    if (pos.eyeFar) {
        // Far from center: left eye = left side, right eye = right side
        pipL.style.left = margin;
        pipR.style.right = margin;
    }

    // Set aspect ratio
    [pipL, pipR].forEach(el => {
        el.style.width = pipW;
        el.style.aspectRatio = '4/3';
    });
}

function exitVR() {
    console.log('[VR] Exiting VR');
    hidePIP();
    $('#vr-overlay').classList.add('hidden');

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    try { screen.orientation.unlock(); } catch {}

    showSection(lobby);
}
```

**Step 2: Add VR event listeners**

Add to the event listeners section:

```js
$('#btn-enter-vr').addEventListener('click', enterVR);
$('#vr-exit-zone').addEventListener('click', exitVR);

// Scale slider
let vrScaleTimeout = null;
$('#vr-scale-slider').addEventListener('input', (e) => {
    const scale = e.target.value / 100;
    $('#vr-main').style.transform = `scale(${scale})`;
    $('#vr-main').style.transformOrigin = 'center center';
});

// Tap VR to show scale slider
$('#vr-view').addEventListener('click', (e) => {
    if (e.target.closest('#vr-exit-zone') || e.target.closest('#vr-scale-controls')) return;
    const controls = $('#vr-scale-controls');
    controls.classList.toggle('hidden');
    clearTimeout(vrScaleTimeout);
    if (!controls.classList.contains('hidden')) {
        vrScaleTimeout = setTimeout(() => controls.classList.add('hidden'), 4000);
    }
});
```

**Step 3: Add stream loss handling**

```js
// Call this periodically or on peer events to check if VR streams are still valid
function checkVRStreams() {
    if (vrView.classList.contains('hidden')) return;

    // Check main view
    if (mainViewPeerId) {
        const stream = getStreamForPeer(mainViewPeerId);
        if (!stream || !stream.active) {
            const name = mainViewPeerId === 'self' ? myName :
                (peers.get(mainViewPeerId)?.name || 'Unknown');
            showVROverlay(`Stream lost — ${name} disconnected`);
        }
    }

    // Check PIP view
    if (pipViewPeerId) {
        const stream = getStreamForPeer(pipViewPeerId);
        if (!stream || !stream.active) {
            // Show disconnected briefly then hide PIP
            showPIPDisconnected();
        }
    }
}

function showVROverlay(msg) {
    $('#vr-overlay-msg').textContent = msg;
    $('#vr-overlay').classList.remove('hidden');
}

function showPIPDisconnected() {
    const pipL = $('#vr-pip-left');
    const pipR = $('#vr-pip-right');

    // Black out PIP videos
    pipL.querySelector('video').srcObject = null;
    pipR.querySelector('video').srcObject = null;
    pipL.style.background = '#000';
    pipR.style.background = '#000';

    setTimeout(() => {
        hidePIP();
        pipL.style.background = '';
        pipR.style.background = '';
        pipViewPeerId = null;
    }, 3000);
}
```

**Step 4: Hook stream loss checks into peer removal**

Modify the existing `removePeer` function to call `checkVRStreams()` at the end:

```js
// At the end of removePeer():
    checkVRStreams();
```

**Step 5: Verify**

Two tabs, same room. Tab 1 shares camera. Tab 2 selects Tab 1 as main view, clicks "Enter VR" → stereo view of Tab 1's camera. Exit zone works. Scale slider works.

**Step 6: Commit**

```bash
git add site/vr-mesh/app.js
git commit -m "feat(vr-mesh): add VR view with main stream, PIP, scale slider, and stream loss handling"
```

---

### Task 5: Host handoff and peer disconnect cleanup

**Files:**
- Modify: `site/vr-mesh/app.js`

**Step 1: Add host handoff logic**

Add after `becomeHost`:

```js
// When we detect the host has disconnected, try to become the new host
function attemptHostHandoff() {
    if (isHost) return; // we're already host

    console.log('[HOST] Attempting host handoff for room:', roomName);

    // Destroy and recreate peer with room name
    const oldId = myPeer.id;
    const oldPeers = new Map(peers);

    myPeer.destroy();
    myPeer = new Peer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Successfully became new host');
        isHost = true;
        setupHostListeners();

        // Reconnect to all existing peers
        oldPeers.forEach((peer, id) => {
            connectToPeer(id, peer.name);
        });
    });

    myPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            console.log('[HOST] Someone else became host first');
            // Reconnect as regular peer
            myPeer = new Peer(undefined, { config: { iceServers: CONFIG.iceServers } });
            myPeer.on('open', () => {
                oldPeers.forEach((peer, id) => {
                    connectToPeer(id, peer.name);
                });
            });
        }
    });
}
```

**Step 2: Detect host disconnect**

In the existing `connectToPeer` function, add host disconnect detection to the `conn.on('close')` handler. After `removePeer(peerId)`:

```js
        // If the disconnected peer was the host, attempt handoff
        if (peerId === roomName) {
            attemptHostHandoff();
        }
```

**Step 3: Broadcast leave on disconnect**

Add to the Leave button handler, before `myPeer.destroy()`:

```js
    // Notify peers we're leaving
    peers.forEach((peer) => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'peer-left', peerId: myPeer.id });
        }
    });
```

**Step 4: Verify**

Three tabs in same room. Close Tab 1 (host). Tabs 2 and 3 should remain connected, one becomes new host. A new Tab 4 can join using the room code.

**Step 5: Commit**

```bash
git add site/vr-mesh/app.js
git commit -m "feat(vr-mesh): add host handoff on disconnect and leave notification"
```

---

### Task 6: Add to site index, final polish, and deploy config

**Files:**
- Modify: `site/index.html`
- Create: deploy step for `config.json`

**Step 1: Add VR Mesh to site index**

In `site/index.html`, add to the "Other" section:

```html
        <li><a href="/vr-mesh/">VR Mesh</a> — P2P VR video mesh</li>
```

**Step 2: Ensure `config.json` is deployed**

Since `config.json` is gitignored, we need it to exist on GitHub Pages. Two options:

Option A: Just commit it (TURN credentials aren't high-security for a fun project).
Option B: Add a GitHub Actions step to create it during deploy.

For simplicity, remove `site/vr-mesh/config.json` from `.gitignore` and commit it. The TURN credentials are for a personal project TURN server with low stakes.

**Step 3: Commit**

```bash
git add site/index.html site/vr-mesh/config.json .gitignore
git commit -m "feat(vr-mesh): add to site index and deploy config"
```

---

### Task 7: Manual end-to-end testing

**Test checklist (3 devices — laptop + 2 phones):**

1. Laptop opens VR Mesh, joins room "test-room"
2. Phone A scans QR or enters "test-room", joins
3. Phone B enters "test-room", joins
4. All three see each other in peer list
5. Laptop clicks "Share Camera" → preview appears, phones see "Sharing" status
6. Phone A selects Laptop as main view, clicks "Enter VR" → stereo view of laptop camera
7. Phone B also enters VR watching laptop → both see laptop's feed
8. Laptop shares, Phone A shares → Phone B can select PIP (Phone A) + Main (Laptop)
9. Phone B enters VR with PIP → main view + small PIP in chosen corner
10. Laptop stops sharing → Phone A/B see "Stream lost" message
11. Close laptop → host handoff occurs, phones remain connected
12. Scale slider works in VR view
13. Leave and rejoin → room appears in history dropdown
