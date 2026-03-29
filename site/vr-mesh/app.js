// --- Config & Debug ---
let CONFIG = { debug: false, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function loadConfig() {
    try {
        const resp = await fetch('config.json');
        if (resp.ok) {
            CONFIG = { ...CONFIG, ...await resp.json() };
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
    console.log = (...a) => { const m = a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); if (window.__logs.length > 1000) window.__logs.shift(); _log.apply(console, a); };
    console.error = (...a) => { const m = '[ERR] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); if (window.__logs.length > 1000) window.__logs.shift(); _err.apply(console, a); };
    console.warn = (...a) => { const m = '[WARN] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(m); if (window.__logs.length > 1000) window.__logs.shift(); _warn.apply(console, a); };

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
    console.log('[UI] showSection:', section.id);
    [joinScreen, lobby, vrView].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

// Exit VR when fullscreen is exited (e.g. via Escape key)
document.addEventListener('fullscreenchange', () => {
    console.log('[FULLSCREEN] Changed, element:', document.fullscreenElement ? document.fullscreenElement.id || document.fullscreenElement.tagName : 'none');
    if (!document.fullscreenElement && !vrView.classList.contains('hidden')) {
        console.log('[FULLSCREEN] Fullscreen exited while in VR, calling exitVR');
        exitVR();
    }
});

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

// --- Room history dropdown ---
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
            const nameSpan = document.createElement('span');
            nameSpan.className = 'room-name';
            nameSpan.textContent = r.name;
            const dateSpan = document.createElement('span');
            dateSpan.className = 'room-date';
            dateSpan.textContent = dateStr;
            item.appendChild(nameSpan);
            item.appendChild(dateSpan);
            item.addEventListener('click', () => {
                input.value = r.name;
                historyEl.classList.add('hidden');
            });
            historyEl.appendChild(item);
        });
        historyEl.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.combo-input') && !e.target.closest('#room-history')) {
            historyEl.classList.add('hidden');
        }
    });
}

// --- State ---
let myPeer = null;
let myName = '';
let roomName = '';
let localStream = null;
let selectedDeviceId = null;
let sharingCamera = false;
let isHost = false;
let whepPeerConnection = null;
let whepResourceUrl = null;
let whepStream = null;
// WHEP virtual peer: calls made to real peers to send the WHEP stream
// peerId -> MediaConnection
const whepCalls = new Map();

// peers map: peerId -> { name, conn (DataConnection), call (MediaConnection), stream, sharing }
const peers = new Map();

// Buffer for streams that arrive before the peer is added to the map
const pendingStreams = new Map(); // peerId -> { stream, call }

// View state
let mainViewPeerId = null;
let pipViewPeerId = null;
let pipCorner = 'bl';
let pipDisconnectTimeout = null;
let becomingHost = false;
let vrWakeLock = null;

// --- Centralized Peer Management ---

// Centralized peer replacement — ensures old peer is cleaned up
function replacePeer(...args) {
    if (myPeer && !myPeer.destroyed) {
        myPeer.destroy();
    }
    myPeer = new Peer(...args);
    // Register common listeners on every new peer
    myPeer.on('call', handleIncomingCall);
    myPeer.on('connection', handleIncomingConnection);
    return myPeer;
}

function handleIncomingConnection(conn) {
    conn.on('data', (data) => {
        if (data.type === 'hello') {
            console.log('[PEER] Peer introduced:', data.name, data.peerId, 'sharing:', data.sharing);
            addPeer(data.peerId, data.name, conn);
            if (data.sharing) {
                const p = peers.get(data.peerId);
                if (p) p.sharing = true;
            }
            // If we're host, send peer list and broadcast new peer
            if (isHost) {
                const peerList = [
                    { peerId: myPeer.id, name: myName, sharing: sharingCamera },
                    ...Array.from(peers.entries()).map(([id, p]) => ({
                        peerId: id, name: p.name, sharing: p.sharing
                    }))
                ];
                // Include WHEP virtual peer if active
                if (whepStream && whepStream.active) {
                    peerList.push({ peerId: 'whep-stream', name: getWhepStreamName(), sharing: true, virtual: true });
                }
                conn.send({ type: 'peer-list', peers: peerList });
                if (sharingCamera && localStream) {
                    callPeerWithStream(data.peerId);
                }
                // Send WHEP stream to the new peer
                if (whepStream && whepStream.active) {
                    callPeerWithWhepStream(data.peerId);
                }
                peers.forEach((p, id) => {
                    if (id !== data.peerId && p.conn && p.conn.open) {
                        p.conn.send({ type: 'new-peer', peerId: data.peerId, name: data.name });
                    }
                });
            }
        } else if (data.type === 'camera-status') {
            handleCameraStatus(data);
        } else if (data.type === 'new-peer') {
            connectToPeer(data.peerId, data.name);
        } else if (data.type === 'peer-left') {
            removePeer(data.peerId);
        } else if (data.type === 'virtual-peer') {
            // A remote peer is advertising a virtual peer (e.g. WHEP stream)
            console.log('[PEER] Virtual peer announced:', data.virtualPeerId, data.name);
            addPeer(data.virtualPeerId, data.name, null);
            const p = peers.get(data.virtualPeerId);
            if (p) { p.sharing = true; p.virtual = true; }
            updatePeerList();
            updateViewDropdowns();
        } else if (data.type === 'virtual-peer-left') {
            console.log('[PEER] Virtual peer left:', data.virtualPeerId);
            removePeer(data.virtualPeerId);
        }
    });
    conn.on('close', () => {
        let closedPeerId = null;
        peers.forEach((p, id) => {
            if (p.conn === conn) closedPeerId = id;
        });
        if (closedPeerId) {
            console.log('[PEER] Connection closed, removing:', closedPeerId);
            removePeer(closedPeerId);
            if (isHost) {
                peers.forEach((p, id) => {
                    if (p.conn && p.conn.open) {
                        p.conn.send({ type: 'peer-left', peerId: closedPeerId });
                    }
                });
            }
        }
    });
}

// --- Room Join ---
let joinedRoom = false; // true once we've entered the lobby
let joinRetries = 0;
const MAX_JOIN_RETRIES = 5;

async function joinRoom() {
    const nameInput = $('#name-input');
    const roomInput = $('#room-input');
    const statusEl = $('#join-status');

    joinRetries++;
    if (joinRetries > MAX_JOIN_RETRIES) {
        statusEl.textContent = 'Could not join room. Try again.';
        statusEl.className = 'status error';
        return;
    }

    myName = nameInput.value.trim() || nameInput.placeholder;
    roomName = roomInput.value.trim() || roomInput.placeholder;
    joinedRoom = false;

    console.log('[JOIN] Joining room:', roomName, 'as:', myName);
    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status waiting';

    saveName(myName);
    saveRoomToHistory(roomName);

    replacePeer(undefined, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', (myId) => {
        console.log('[PEER] My peer ID:', myId);

        const hostConn = myPeer.connect(roomName, { reliable: true });

        hostConn.on('open', () => {
            console.log('[JOIN] Connected to room host');
            hostConn.send({ type: 'hello', name: myName, peerId: myId });
        });

        hostConn.on('data', (data) => {
            console.log('[JOIN] Received from host:', JSON.stringify(data));
            if (data.type === 'peer-list') {
                data.peers.forEach(p => {
                    if (p.peerId !== myId) {
                        if (p.virtual) {
                            // Virtual peer — just add to peers map, stream will arrive via call
                            addPeer(p.peerId, p.name, null);
                            const peer = peers.get(p.peerId);
                            if (peer) { peer.sharing = true; peer.virtual = true; }
                        } else {
                            connectToPeer(p.peerId, p.name);
                        }
                    }
                });
                enterLobby();
            } else if (data.type === 'camera-status') {
                handleCameraStatus(data);
            } else if (data.type === 'new-peer') {
                connectToPeer(data.peerId, data.name);
            } else if (data.type === 'peer-left') {
                removePeer(data.peerId);
            } else if (data.type === 'virtual-peer') {
                console.log('[PEER] Virtual peer announced:', data.virtualPeerId, data.name);
                addPeer(data.virtualPeerId, data.name, null);
                const p = peers.get(data.virtualPeerId);
                if (p) { p.sharing = true; p.virtual = true; }
                updatePeerList();
                updateViewDropdowns();
            } else if (data.type === 'virtual-peer-left') {
                console.log('[PEER] Virtual peer left:', data.virtualPeerId);
                removePeer(data.virtualPeerId);
            }
        });

        hostConn.on('error', (err) => {
            console.log('[JOIN] Could not reach host, becoming host. Error:', err);
            becomeHost(myId);
        });

        setTimeout(() => {
            if (joinedRoom || becomingHost) return;
            if (!lobby.classList.contains('hidden')) return;
            if (hostConn.open) return;
            console.log('[JOIN] Host connection timeout, becoming host');
            becomeHost(myPeer.id);
        }, 5000);
    });

    myPeer.on('error', (err) => {
        console.error('[PEER] Error:', err.type, 'joinedRoom:', joinedRoom);
        if (err.type === 'peer-unavailable') {
            if (!joinedRoom) {
                // Room host doesn't exist — we're first, become host
                console.log('[JOIN] ROOM_NOT_FOUND: no host registered for room "' + roomName + '", becoming host');
                becomeHost(myPeer.id);
            } else {
                // A specific peer we tried to connect to doesn't exist (stale/disconnected)
                console.log('[PEER] STALE_PEER: peer-unavailable after join, ignoring');
            }
        } else if (err.type === 'network') {
            console.warn('[PEER] NETWORK_ERROR: transient network issue, ignoring');
        } else {
            console.error('[PEER] CONNECTION_FAILED:', err.type);
            statusEl.textContent = 'Connection failed. Try again.';
            statusEl.className = 'status error';
        }
    });
}

function becomeHost(myId) {
    console.log('[HOST] Becoming host for room:', roomName);
    becomingHost = true;
    isHost = true;

    replacePeer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Registered as room:', roomName);
        becomingHost = false;
        enterLobby();
    });

    myPeer.on('error', (err) => {
        console.error('[HOST] Error:', err.type, err);
        becomingHost = false;
        if (err.type === 'unavailable-id') {
            console.log('[HOST] Room taken, retrying as joiner');
            isHost = false;
            joinRetries = 0;
            joinRoom();
        } else {
            $('#join-status').textContent = 'Connection failed. Try again.';
            $('#join-status').className = 'status error';
        }
    });
}

function attemptHostHandoff() {
    if (isHost) return;

    console.log('[HOST] Attempting host handoff for room:', roomName);

    const oldPeers = new Map(peers);

    replacePeer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Successfully became new host');
        isHost = true;

        // Reconnect to all existing peers
        peers.clear();
        oldPeers.forEach((peer, id) => {
            connectToPeer(id, peer.name);
        });

        // Re-share camera if it was active
        if (sharingCamera && localStream) {
            console.log('[HOST] Re-sharing camera after handoff');
            setTimeout(() => {
                peers.forEach((peer, id) => {
                    if (id === 'whep-stream') return;
                    callPeerWithStream(id);
                });
                broadcastCameraStatus(true);
                // Re-share WHEP stream if active
                if (whepStream && whepStream.active) {
                    const whepName = getWhepStreamName();
                    peers.forEach((peer, id) => {
                        if (id === 'whep-stream') return;
                        callPeerWithWhepStream(id);
                        if (peer.conn && peer.conn.open) {
                            peer.conn.send({ type: 'virtual-peer', virtualPeerId: 'whep-stream', name: whepName });
                        }
                    });
                }
            }, 1000);
        }
    });

    myPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            console.log('[HOST] Someone else became host first');
            replacePeer(undefined, { config: { iceServers: CONFIG.iceServers } });
            myPeer.on('error', (err) => {
                console.error('[PEER] Error on fallback peer:', err.type);
            });
            myPeer.on('open', () => {
                oldPeers.forEach((peer, id) => {
                    connectToPeer(id, peer.name);
                });
            });
        }
    });
}

function enterLobby() {
    if (joinedRoom) {
        console.log('[LOBBY] Already joined, ignoring duplicate enterLobby call');
        return;
    }
    joinedRoom = true;
    console.log('[LOBBY] Entering lobby');
    showSection(lobby);
    $('#lobby-room-name').textContent = roomName;
    $('#lobby-your-name').textContent = myName;
    generateRoomQR();
    updatePeerList();
    updateViewDropdowns();

    // Update URL so refresh keeps you in this room
    const url = new URL(window.location);
    url.searchParams.set('room', roomName);
    history.replaceState(null, '', url);
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

// --- Peer Management ---
function addPeer(peerId, name, conn) {
    if (peers.has(peerId)) return;
    console.log('[PEERS] Adding peer:', name, peerId);
    peers.set(peerId, { name, conn, call: null, stream: null, sharing: false });

    // Check for buffered streams that arrived before this peer was added
    const pending = pendingStreams.get(peerId);
    if (pending) {
        console.log('[PEERS] Applying buffered stream for:', name);
        const peer = peers.get(peerId);
        peer.stream = pending.stream;
        peer.call = pending.call;
        peer.sharing = true;
        pendingStreams.delete(peerId);
    }

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
    checkVRStreams();
}

function connectToPeer(peerId, name) {
    if (peers.has(peerId)) return;
    console.log('[PEERS] Connecting to peer:', name, peerId);
    const conn = myPeer.connect(peerId, { reliable: true });

    conn.on('open', () => {
        console.log('[PEERS] Data connection open to:', name);
        conn.send({ type: 'hello', name: myName, peerId: myPeer.id, sharing: sharingCamera });
        addPeer(peerId, name, conn);

        // If we're sharing camera, call this peer
        if (sharingCamera && localStream) {
            callPeerWithStream(peerId);
        }
        // If we have a WHEP stream, send it too
        if (whepStream && whepStream.active) {
            callPeerWithWhepStream(peerId);
            conn.send({ type: 'virtual-peer', virtualPeerId: 'whep-stream', name: getWhepStreamName() });
        }

        conn.on('data', (data) => {
            if (data.type === 'camera-status') {
                handleCameraStatus(data);
            } else if (data.type === 'new-peer') {
                connectToPeer(data.peerId, data.name);
            } else if (data.type === 'peer-left') {
                removePeer(data.peerId);
            } else if (data.type === 'virtual-peer') {
                console.log('[PEER] Virtual peer announced:', data.virtualPeerId, data.name);
                addPeer(data.virtualPeerId, data.name, null);
                const p = peers.get(data.virtualPeerId);
                if (p) { p.sharing = true; p.virtual = true; }
                updatePeerList();
                updateViewDropdowns();
            } else if (data.type === 'virtual-peer-left') {
                console.log('[PEER] Virtual peer left:', data.virtualPeerId);
                removePeer(data.virtualPeerId);
            }
        });
    });

    conn.on('close', () => {
        console.log('[PEERS] Connection closed to:', name);
        removePeer(peerId);

        // If the disconnected peer was the host, attempt handoff
        if (peerId === roomName) {
            attemptHostHandoff();
        }
    });
}

function handleIncomingCall(call) {
    console.log('[CALL] Incoming call from:', call.peer, 'metadata:', JSON.stringify(call.metadata));
    const stream = sharingCamera ? localStream : createEmptyStream();
    call.answer(stream);

    call.on('stream', (remoteStream) => {
        // Check if this is a WHEP virtual peer stream
        const isWhepCall = call.metadata && call.metadata.virtualPeerId === 'whep-stream';
        const targetPeerId = isWhepCall ? 'whep-stream' : call.peer;
        console.log('[CALL] Received stream from:', call.peer, isWhepCall ? '(WHEP virtual peer)' : '');
        applyStreamToPeer(targetPeerId, remoteStream, call);
    });

    call.on('close', () => {
        console.log('[CALL] Call closed from:', call.peer);
    });
}

// Call a peer with our stream and handle the return stream
function callPeerWithStream(peerId) {
    if (!localStream) return;
    console.log('[CALL] Calling peer with our stream:', peerId);
    const call = myPeer.call(peerId, localStream);
    const peer = peers.get(peerId);
    if (peer) peer.call = call;
    call.on('stream', (remoteStream) => {
        applyStreamToPeer(peerId, remoteStream, call);
    });
}

// Call a peer with the WHEP stream (virtual peer)
function callPeerWithWhepStream(peerId) {
    if (!whepStream || !whepStream.active) return;
    console.log('[WHEP] Calling peer with WHEP stream:', peerId);
    const call = myPeer.call(peerId, whepStream, { metadata: { virtualPeerId: 'whep-stream' } });
    whepCalls.set(peerId, call);
    call.on('stream', () => {
        // We don't need the return stream for WHEP calls
    });
    call.on('close', () => {
        whepCalls.delete(peerId);
    });
}

function getWhepStreamName() {
    const label = $('#stream-label-input').value.trim();
    if (label) return label;

    const url = $('#stream-url-input').value.trim();
    if (url) {
        try {
            const parsed = new URL(url);
            const pathName = parsed.pathname.replace(/\/whep$/, '').split('/').filter(Boolean).pop();
            if (pathName) return pathName;
        } catch {}
    }
    return 'External Stream';
}

function applyStreamToPeer(peerId, stream, call) {
    const peer = peers.get(peerId);
    if (peer) {
        console.log('[STREAM] Applying stream to peer:', peer.name);
        peer.stream = stream;
        peer.call = call;
        peer.sharing = true;
        updatePeerList();
        updateViewDropdowns();
    } else {
        console.log('[STREAM] Peer not in map yet, buffering stream for:', peerId);
        pendingStreams.set(peerId, { stream, call });
    }
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

// --- Camera Sharing ---
async function populateCameraList() {
    const select = $('#camera-select');
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        console.log('[CAMERA] Enumerated', devices.length, 'devices,', cameras.length, 'cameras:');
        cameras.forEach((cam, i) => {
            console.log('[CAMERA]  ', i, cam.label || '(no label)', cam.deviceId?.slice(0, 12) + '...', cam.groupId?.slice(0, 8) + '...');
        });
        select.innerHTML = '';
        if (cameras.length === 0) {
            select.innerHTML = '<option value="">No cameras found</option>';
            return;
        }
        cameras.sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true }));
        cameras.forEach((cam, i) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            const label = cam.label || `Camera ${i + 1}`;
            opt.textContent = label.replace(/\b\w/g, c => c.toUpperCase()).replace(/ *, */g, ' - ');
            if (cam.deviceId === selectedDeviceId) opt.selected = true;
            select.appendChild(opt);
        });
        // If no device was previously selected, select the first
        if (!selectedDeviceId && cameras.length > 0) {
            selectedDeviceId = cameras[0].deviceId;
        }
        // Auto-select if current device is in the list
        if (selectedDeviceId) {
            select.value = selectedDeviceId;
        }
        if (cameras.length > 1) {
            select.classList.remove('hidden');
        }
    } catch (err) {
        console.warn('[CAMERA] Could not enumerate devices:', err);
    }
}

async function switchCamera(deviceId) {
    if (!deviceId) return;
    selectedDeviceId = deviceId;
    try {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: false
        });
        $('#camera-preview').srcObject = localStream;

        // Replace track on all active calls
        const newTrack = localStream.getVideoTracks()[0];
        peers.forEach((peer) => {
            if (peer.virtual) return; // skip virtual peers
            if (peer.call && peer.call.peerConnection) {
                const sender = peer.call.peerConnection.getSenders()
                    .find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack);
            }
        });
    } catch (err) {
        console.error('[CAMERA] Switch failed:', err);
    }
}

async function startCamera() {
    try {
        const constraints = { audio: false };
        if (selectedDeviceId) {
            constraints.video = { deviceId: { exact: selectedDeviceId } };
        } else {
            constraints.video = { facingMode: 'environment' };
        }
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[CAMERA] Camera started');

        // After getting permission, populate camera list (labels now available)
        const track = localStream.getVideoTracks()[0];
        if (track) {
            const settings = track.getSettings();
            if (settings.deviceId) selectedDeviceId = settings.deviceId;
        }
        await populateCameraList();

        $('#camera-preview').srcObject = localStream;
        $('#camera-preview').classList.remove('hidden');
        sharingCamera = true;
        $('#btn-share-camera').classList.add('active');
        $('#btn-share-camera').textContent = 'Stop Sharing';

        // Call all connected peers to send them our stream
        peers.forEach((peer, id) => {
            if (peer.virtual) return; // skip virtual peers (e.g. WHEP)
            if (peer.call) {
                // Already have a call, just replace the track
                if (peer.call.peerConnection) {
                    const sender = peer.call.peerConnection.getSenders()
                        .find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(localStream.getVideoTracks()[0]);
                        return;
                    }
                }
            }
            console.log('[CAMERA] Calling peer:', peer.name);
            callPeerWithStream(id);
        });

        // Notify peers of camera status
        broadcastCameraStatus(true);
        updateViewDropdowns();
    } catch (err) {
        console.error('[CAMERA] Error:', err);
        // Show a brief message near the share camera button
        const btn = $('#btn-share-camera');
        btn.textContent = 'Camera access needed';
        btn.classList.add('error');
        setTimeout(() => {
            btn.textContent = 'Share Camera';
            btn.classList.remove('error');
        }, 3000);
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
    $('#camera-select').classList.add('hidden');

    broadcastCameraStatus(false);
    updateViewDropdowns();
}


function broadcastCameraStatus(sharing) {
    const msg = { type: 'camera-status', peerId: myPeer.id, sharing };
    peers.forEach((peer) => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send(msg);
        }
    });
}

// --- External Stream (WHEP) ---
async function connectExternalStream(url) {
    const statusEl = $('#stream-status');
    const btn = $('#btn-connect-stream');

    // Normalize the URL: append /whep if the path doesn't already end with it
    if (!url.endsWith('/whep')) {
        url = url.replace(/\/$/, '') + '/whep';
    }

    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status waiting';

    try {
        // Create RTCPeerConnection
        const pc = new RTCPeerConnection({
            iceServers: CONFIG.iceServers
        });
        whepPeerConnection = pc;

        // We need to add a transceiver to receive video
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // Collect ICE candidates to trickle via PATCH
        const pendingCandidates = [];

        pc.onicecandidate = (event) => {
            if (event.candidate && whepResourceUrl) {
                // Trickle ICE candidate via PATCH
                const candidate = event.candidate;
                const body = `a=${candidate.candidate}\r\n`;
                fetch(whepResourceUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
                    body: body
                }).catch(err => console.warn('[WHEP] ICE trickle failed:', err));
            } else if (event.candidate) {
                pendingCandidates.push(event.candidate);
            }
        };

        // When we get the remote stream — treat as virtual peer
        pc.ontrack = (event) => {
            console.log('[WHEP] Got track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                whepStream = event.streams[0];
            } else {
                if (!whepStream || !whepStream.active) {
                    whepStream = new MediaStream();
                }
                whepStream.addTrack(event.track);
            }

            // Show preview
            const preview = $('#stream-preview');
            preview.srcObject = whepStream;
            preview.classList.remove('hidden');

            // Add WHEP as a virtual peer in the local peers map
            const whepName = getWhepStreamName();
            if (!peers.has('whep-stream')) {
                addPeer('whep-stream', whepName, null);
            }
            const whepPeer = peers.get('whep-stream');
            if (whepPeer) {
                whepPeer.stream = whepStream;
                whepPeer.sharing = true;
                whepPeer.virtual = true;
            }

            // Call all connected peers to send them the WHEP stream
            peers.forEach((peer, id) => {
                if (id === 'whep-stream') return; // skip the virtual peer itself
                callPeerWithWhepStream(id);
                // Notify peer about the virtual peer
                if (peer.conn && peer.conn.open) {
                    peer.conn.send({ type: 'virtual-peer', virtualPeerId: 'whep-stream', name: whepName });
                }
            });

            updatePeerList();
            updateViewDropdowns();

            statusEl.textContent = 'Connected';
            statusEl.className = 'status connected';
        };

        pc.onconnectionstatechange = () => {
            console.log('[WHEP] Connection state:', pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                statusEl.textContent = 'Stream disconnected';
                statusEl.className = 'status error';
            }
        };

        // Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // POST the offer to the WHEP endpoint
        console.log('[WHEP] Sending offer to:', url);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: pc.localDescription.sdp
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`WHEP endpoint returned ${resp.status}: ${errText}`);
        }

        // Get the resource URL for ICE trickling
        const location = resp.headers.get('Location');
        if (location) {
            // Location may be relative
            whepResourceUrl = new URL(location, url).href;
            console.log('[WHEP] Resource URL:', whepResourceUrl);

            // Send any pending ICE candidates
            for (const candidate of pendingCandidates) {
                const body = `a=${candidate.candidate}\r\n`;
                fetch(whepResourceUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
                    body: body
                }).catch(err => console.warn('[WHEP] ICE trickle failed:', err));
            }
            pendingCandidates.length = 0;
        }

        // Set the remote SDP answer
        const answerSDP = await resp.text();
        console.log('[WHEP] Got answer SDP, length:', answerSDP.length);
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));

        btn.textContent = 'Disconnect';
        btn.classList.add('active');

    } catch (err) {
        console.error('[WHEP] Error:', err);
        statusEl.textContent = 'Failed: ' + err.message;
        statusEl.className = 'status error';
        disconnectExternalStream();
    }
}

function disconnectExternalStream() {
    if (whepPeerConnection) {
        whepPeerConnection.close();
        whepPeerConnection = null;
    }

    // Send DELETE to the resource URL to clean up server-side
    if (whepResourceUrl) {
        fetch(whepResourceUrl, { method: 'DELETE' }).catch(() => {});
        whepResourceUrl = null;
    }

    // Close all WHEP media calls to peers
    whepCalls.forEach((call) => {
        try { call.close(); } catch {}
    });
    whepCalls.clear();

    // Notify peers that the virtual peer is gone
    peers.forEach((peer, id) => {
        if (id === 'whep-stream') return;
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'virtual-peer-left', virtualPeerId: 'whep-stream' });
        }
    });

    // Remove the virtual peer from our peers map
    removePeer('whep-stream');

    whepStream = null;

    $('#stream-preview').classList.add('hidden');
    $('#stream-preview').srcObject = null;
    $('#btn-connect-stream').textContent = 'Connect';
    $('#btn-connect-stream').classList.remove('active');
    $('#stream-status').textContent = '';
    $('#stream-status').className = 'status';
}

// --- UI Updates ---
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
        const nameSpan = document.createElement('span');
        nameSpan.className = 'peer-name';
        nameSpan.textContent = peer.name;
        const statusSpan = document.createElement('span');
        statusSpan.className = 'peer-status ' + (peer.sharing ? 'sharing' : 'not-sharing');
        statusSpan.textContent = peer.sharing ? 'Sharing' : 'Not sharing';
        item.appendChild(nameSpan);
        item.appendChild(statusSpan);
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

    const sources = [];
    if (sharingCamera && localStream) {
        sources.push({ id: 'self', name: myName + ' (you)' });
    }
    peers.forEach((peer, id) => {
        if (peer.sharing && peer.stream) {
            sources.push({ id, name: peer.name });
        }
    });

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

    mainViewPeerId = mainSelect.value || null;
    pipViewPeerId = pipSelect.value || null;
    $('#btn-enter-vr').disabled = !mainSelect.value;
    $('#pip-corner-picker').classList.toggle('hidden', !pipSelect.value);
}

// --- VR View ---
function getStreamForPeer(peerId) {
    if (peerId === 'self') return localStream;
    // For local WHEP stream, use whepStream directly (more reliable than peers map)
    if (peerId === 'whep-stream' && whepStream && whepStream.active) return whepStream;
    const peer = peers.get(peerId);
    return peer ? peer.stream : null;
}

function enterVR() {
    const mainStream = getStreamForPeer(mainViewPeerId);
    console.log('[VR] enterVR called, mainViewPeerId:', mainViewPeerId, 'stream:', mainStream ? 'exists' : 'null', 'active:', mainStream?.active);
    if (!mainStream) {
        console.warn('[VR] No main stream available, aborting enterVR');
        return;
    }

    console.log('[VR] Entering VR, main:', mainViewPeerId, 'pip:', pipViewPeerId);
    // Reset any stale transform from previous scale slider use
    vrView.style.transform = '';
    $('#vr-scale-slider').value = 100;
    document.body.classList.add('vr-active');
    showSection(vrView);
    $('#vr-controls').classList.remove('hidden');
    $('#vr-controls-inner').classList.add('hidden');

    // Main view
    $('#vr-left').srcObject = mainStream;
    $('#vr-right').srcObject = mainStream;
    $('#vr-left').play().catch(() => {});
    $('#vr-right').play().catch(() => {});

    // PIP view
    if (pipViewPeerId) {
        const pipStream = getStreamForPeer(pipViewPeerId);
        if (pipStream) {
            console.log('[VR] Showing PIP for:', pipViewPeerId);
            showPIP(pipStream);
        }
    } else {
        console.log('[VR] No PIP selected');
    }

    // Fullscreen
    console.log('[VR] Requesting fullscreen');
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().then(() => {
            console.log('[VR] Fullscreen granted');
        }).catch((err) => console.error('[VR] Fullscreen rejected:', err));
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }

    // Landscape lock
    try { screen.orientation.lock('landscape').catch(() => {}); } catch {}

    // Prevent screen from dimming in VR headset
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
            console.log('[VR] Wake lock acquired');
            vrWakeLock = lock;
        }).catch(err => console.log('[VR] Wake lock failed:', err));
    }
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

    // Reset all positioning
    [pipL, pipR].forEach(el => {
        el.style.top = el.style.bottom = el.style.left = el.style.right = 'auto';
        el.style.width = '12.5%';
        el.style.aspectRatio = '4/3';
    });

    // Vertical position
    if (corner.startsWith('t')) {
        pipL.style.top = margin;
        pipR.style.top = margin;
    } else {
        pipL.style.bottom = margin;
        pipR.style.bottom = margin;
    }

    // Horizontal: position within each eye's half
    if (corner.endsWith('l')) {
        // Left side of each eye: left eye near outer edge, right eye near center
        pipL.style.left = margin;
        pipR.style.left = `calc(50% + ${margin})`;
    } else {
        // Right side of each eye: left eye near center, right eye near outer edge
        pipL.style.right = `calc(50% + ${margin})`;
        pipR.style.right = margin;
    }
}

function exitVR() {
    console.log('[VR] exitVR called');
    console.log('[VR] Current state: vr-view hidden:', vrView.classList.contains('hidden'), 'lobby hidden:', lobby.classList.contains('hidden'));
    if (vrWakeLock) {
        vrWakeLock.release().catch(() => {});
        vrWakeLock = null;
    }
    if (pipDisconnectTimeout) { clearTimeout(pipDisconnectTimeout); pipDisconnectTimeout = null; }
    hidePIP();
    $('#vr-overlay').classList.add('hidden');

    console.log('[VR] Fullscreen element:', document.fullscreenElement ? document.fullscreenElement.id || document.fullscreenElement.tagName : 'none');
    if (document.fullscreenElement) {
        document.exitFullscreen().catch((err) => console.error('[VR] exitFullscreen failed:', err));
    }
    try { screen.orientation.unlock(); } catch {}

    $('#vr-controls').classList.add('hidden');
    document.body.classList.remove('vr-active');
    showSection(lobby);
    console.log('[VR] exitVR complete, lobby should be visible');
}

// --- Stream Loss ---
function checkVRStreams() {
    if (vrView.classList.contains('hidden')) return;
    console.log('[VR-CHECK] Checking VR streams, mainViewPeerId:', mainViewPeerId, 'pipViewPeerId:', pipViewPeerId);

    // Check main view
    if (mainViewPeerId) {
        const stream = getStreamForPeer(mainViewPeerId);
        console.log('[VR-CHECK] Main stream:', stream ? 'exists' : 'null', 'active:', stream?.active, 'peerId:', mainViewPeerId);
        if (!stream || !stream.active) {
            const name = mainViewPeerId === 'self' ? myName :
                (peers.get(mainViewPeerId)?.name || 'Unknown');
            console.log('[VR-CHECK] *** MAIN STREAM LOST *** name:', name);
            showVROverlay(`Stream lost — ${name} disconnected`);
        }
    }

    // Check PIP view
    if (pipViewPeerId) {
        const stream = getStreamForPeer(pipViewPeerId);
        console.log('[VR-CHECK] PIP stream:', stream ? 'exists' : 'null', 'active:', stream?.active, 'peerId:', pipViewPeerId);
        if (!stream || !stream.active) {
            console.log('[VR-CHECK] *** PIP STREAM LOST ***');
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

    pipL.querySelector('video').srcObject = null;
    pipR.querySelector('video').srcObject = null;
    pipL.style.background = '#000';
    pipR.style.background = '#000';

    pipDisconnectTimeout = setTimeout(() => {
        hidePIP();
        pipL.style.background = '';
        pipR.style.background = '';
        pipViewPeerId = null;
        pipDisconnectTimeout = null;
    }, 3000);
}

// --- Init ---
async function init() {
    await loadConfig();

    const nameInput = $('#name-input');
    const savedName = loadName();
    if (savedName) {
        nameInput.value = savedName;
    } else {
        nameInput.placeholder = generateFunName();
    }

    $('#room-input').placeholder = generateRoomCode();

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        $('#room-input').value = roomParam;
        // Auto-join if room is in URL (e.g. page refresh or QR scan)
        joinRoom();
    }

    setupRoomHistory();
}

// --- Event Listeners ---
$('#btn-join').addEventListener('click', () => {
    joinRetries = 0;
    joinRoom();
});
$('#name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { $('#room-input').focus(); }
});
$('#room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        joinRetries = 0;
        joinRoom();
    }
});

$('#btn-leave').addEventListener('click', () => {
    console.log('[LOBBY] Leaving room');
    joinRetries = 0;
    if (whepPeerConnection) disconnectExternalStream();
    if (sharingCamera) stopCamera();
    peers.forEach((peer) => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'peer-left', peerId: myPeer.id });
        }
    });
    if (myPeer) myPeer.destroy();
    peers.clear();
    pendingStreams.clear();
    myPeer = null;
    isHost = false;
    joinedRoom = false;
    becomingHost = false;
    // Clear room from URL
    const url = new URL(window.location);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
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

$('#btn-share-camera').addEventListener('click', () => {
    if (sharingCamera) {
        stopCamera();
    } else {
        startCamera();
    }
});

$('#camera-select').addEventListener('change', (e) => {
    if (sharingCamera && e.target.value) {
        switchCamera(e.target.value);
    }
});

$('#btn-connect-stream').addEventListener('click', () => {
    if (whepPeerConnection) {
        disconnectExternalStream();
    } else {
        const url = $('#stream-url-input').value.trim();
        if (!url) {
            $('#stream-status').textContent = 'Enter a stream URL';
            $('#stream-status').className = 'status error';
            return;
        }
        connectExternalStream(url);
    }
});

$('#stream-url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        $('#btn-connect-stream').click();
    }
});

$('#btn-enter-vr').addEventListener('click', () => {
    console.log('[EVENT] Enter VR button clicked');
    enterVR();
});
$('#vr-exit-zone').addEventListener('click', (e) => {
    console.log('[EVENT] Exit zone clicked');
    e.stopPropagation();
    exitVR();
});

// Scale slider
let vrScaleTimeout = null;
$('#vr-scale-slider').addEventListener('input', (e) => {
    const scale = e.target.value / 100;
    vrView.style.transform = `scale(${scale})`;
    vrView.style.transformOrigin = 'center center';
    // Reset auto-hide timer while adjusting
    clearTimeout(vrScaleTimeout);
    vrScaleTimeout = setTimeout(() => {
        $('#vr-controls-inner').classList.add('hidden');
    }, 4000);
});

// Tap VR controls overlay to show/hide exit + slider
$('#vr-controls').addEventListener('click', (e) => {
    console.log('[EVENT] vr-controls clicked, target:', e.target.id || e.target.tagName, 'closest exit:', !!e.target.closest('#vr-exit-zone'), 'closest scale:', !!e.target.closest('#vr-scale-controls'));
    if (e.target.closest('#vr-exit-zone') || e.target.closest('#vr-scale-controls')) {
        console.log('[EVENT] Ignoring — click was on exit zone or scale controls');
        return;
    }
    const inner = $('#vr-controls-inner');
    const wasHidden = inner.classList.contains('hidden');
    inner.classList.toggle('hidden');
    console.log('[EVENT] Toggled vr-controls-inner, was:', wasHidden ? 'hidden' : 'visible', 'now:', inner.classList.contains('hidden') ? 'hidden' : 'visible');
    clearTimeout(vrScaleTimeout);
    if (!inner.classList.contains('hidden')) {
        vrScaleTimeout = setTimeout(() => {
            console.log('[EVENT] Auto-hiding vr-controls-inner after 4s');
            inner.classList.add('hidden');
        }, 4000);
    }
});

window.addEventListener('pagehide', () => {
    if (whepPeerConnection) disconnectExternalStream();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (whepStream) whepStream.getTracks().forEach(t => t.stop());
    if (myPeer && !myPeer.destroyed) myPeer.destroy();
});

init();
