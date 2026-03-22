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
            item.innerHTML = `<span class="room-name">${r.name}</span><span class="room-date">${dateStr}</span>`;
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
let currentFacingMode = 'environment';
let sharingCamera = false;
let isHost = false;

// peers map: peerId -> { name, conn (DataConnection), call (MediaConnection), stream, sharing }
const peers = new Map();

// Buffer for streams that arrive before the peer is added to the map
const pendingStreams = new Map(); // peerId -> { stream, call }

// View state
let mainViewPeerId = null;
let pipViewPeerId = null;
let pipCorner = 'bl';

// --- Room Join ---
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

    myPeer = new Peer(undefined, { config: { iceServers: CONFIG.iceServers } });

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
                        connectToPeer(p.peerId, p.name, p.sharing);
                    }
                });
                enterLobby();
            } else if (data.type === 'camera-status') {
                handleCameraStatus(data);
            } else if (data.type === 'new-peer') {
                connectToPeer(data.peerId, data.name);
            } else if (data.type === 'peer-left') {
                removePeer(data.peerId);
            }
        });

        hostConn.on('error', (err) => {
            console.log('[JOIN] Could not reach host, becoming host. Error:', err);
            becomeHost(myId);
        });

        setTimeout(() => {
            if (!lobby.classList.contains('hidden')) return;
            if (hostConn.open) return;
            console.log('[JOIN] Host connection timeout, becoming host');
            becomeHost(myPeer.id);
        }, 5000);
    });

    myPeer.on('error', (err) => {
        console.error('[PEER] Error:', err.type, err);
        if (err.type === 'peer-unavailable') {
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

    if (myPeer && !myPeer.destroyed) {
        myPeer.destroy();
    }
    myPeer = new Peer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Registered as room:', roomName);
        setupHostListeners();
        enterLobby();
    });

    myPeer.on('error', (err) => {
        console.error('[HOST] Error:', err.type, err);
        if (err.type === 'unavailable-id') {
            console.log('[HOST] Room taken, retrying as joiner');
            isHost = false;
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

    if (myPeer && !myPeer.destroyed) {
        myPeer.destroy();
    }
    myPeer = new Peer(roomName, { config: { iceServers: CONFIG.iceServers } });

    myPeer.on('open', () => {
        console.log('[HOST] Successfully became new host');
        isHost = true;
        setupHostListeners();

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
                    console.log('[HOST] Re-calling peer:', peer.name);
                    const call = myPeer.call(id, localStream);
                    peer.call = call;
                    call.on('stream', (remoteStream) => {
                        peer.stream = remoteStream;
                        peer.sharing = true;
                        updatePeerList();
                        updateViewDropdowns();
                    });
                });
                broadcastCameraStatus(true);
            }, 1000);
        }
    });

    myPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            console.log('[HOST] Someone else became host first');
            myPeer = new Peer(undefined, { config: { iceServers: CONFIG.iceServers } });
            myPeer.on('open', () => {
                oldPeers.forEach((peer, id) => {
                    connectToPeer(id, peer.name);
                });
            });
        }
    });
}

function setupHostListeners() {
    myPeer.on('connection', (conn) => {
        console.log('[HOST] Incoming connection from:', conn.peer);

        conn.on('data', (data) => {
            if (data.type === 'hello') {
                console.log('[HOST] Peer introduced:', data.name, data.peerId, 'sharing:', data.sharing);
                addPeer(data.peerId, data.name, conn);
                if (data.sharing) {
                    const p = peers.get(data.peerId);
                    if (p) p.sharing = true;
                }

                const peerList = [
                    { peerId: myPeer.id, name: myName, sharing: sharingCamera },
                    ...Array.from(peers.entries()).map(([id, p]) => ({
                        peerId: id, name: p.name, sharing: p.sharing
                    }))
                ];
                conn.send({ type: 'peer-list', peers: peerList });

                // If we're sharing, call the new peer
                if (sharingCamera && localStream) {
                    console.log('[HOST] Calling new peer with our stream:', data.name);
                    const call = myPeer.call(data.peerId, localStream);
                    const newPeer = peers.get(data.peerId);
                    if (newPeer) newPeer.call = call;
                    call.on('stream', (remoteStream) => {
                        const p = peers.get(data.peerId);
                        if (p) {
                            p.stream = remoteStream;
                            p.sharing = true;
                            updatePeerList();
                            updateViewDropdowns();
                        }
                    });
                }

                peers.forEach((p, id) => {
                    if (id !== data.peerId && p.conn && p.conn.open) {
                        p.conn.send({ type: 'new-peer', peerId: data.peerId, name: data.name });
                    }
                });
            }
        });
    });

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

function connectToPeer(peerId, name, initialSharing) {
    if (peers.has(peerId)) return;
    console.log('[PEERS] Connecting to peer:', name, peerId, 'sharing:', initialSharing);
    const conn = myPeer.connect(peerId, { reliable: true });

    conn.on('open', () => {
        console.log('[PEERS] Data connection open to:', name);
        conn.send({ type: 'hello', name: myName, peerId: myPeer.id, sharing: sharingCamera });
        addPeer(peerId, name, conn);
        if (initialSharing) {
            const peer = peers.get(peerId);
            if (peer) peer.sharing = true;
            updatePeerList();
            updateViewDropdowns();
        }

        // If we're sharing camera, call this peer
        if (sharingCamera && localStream) {
            console.log('[PEERS] Calling peer with our stream:', name);
            const call = myPeer.call(peerId, localStream);
            const peer = peers.get(peerId);
            if (peer) peer.call = call;
            call.on('stream', (remoteStream) => {
                const p = peers.get(peerId);
                if (p) {
                    p.stream = remoteStream;
                    p.sharing = true;
                    updatePeerList();
                    updateViewDropdowns();
                }
            });
        }

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

        // If the disconnected peer was the host, attempt handoff
        if (peerId === roomName) {
            attemptHostHandoff();
        }
    });
}

function handleIncomingCall(call) {
    console.log('[CALL] Incoming call from:', call.peer);
    const stream = sharingCamera ? localStream : createEmptyStream();
    call.answer(stream);

    call.on('stream', (remoteStream) => {
        console.log('[CALL] Received stream from:', call.peer);
        applyStreamToPeer(call.peer, remoteStream, call);
    });

    call.on('close', () => {
        console.log('[CALL] Call closed from:', call.peer);
    });
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

    $('#btn-enter-vr').disabled = !mainSelect.value;
    $('#pip-corner-picker').classList.toggle('hidden', !pipSelect.value);
}

// --- VR View ---
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
    console.log('[VR] Exiting VR');
    hidePIP();
    $('#vr-overlay').classList.add('hidden');

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    try { screen.orientation.unlock(); } catch {}

    showSection(lobby);
}

// --- Stream Loss ---
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

    setTimeout(() => {
        hidePIP();
        pipL.style.background = '';
        pipR.style.background = '';
        pipViewPeerId = null;
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
    }

    setupRoomHistory();
}

// --- Event Listeners ---
$('#btn-join').addEventListener('click', joinRoom);
$('#room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});

$('#btn-leave').addEventListener('click', () => {
    console.log('[LOBBY] Leaving room');
    peers.forEach((peer) => {
        if (peer.conn && peer.conn.open) {
            peer.conn.send({ type: 'peer-left', peerId: myPeer.id });
        }
    });
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

$('#btn-share-camera').addEventListener('click', () => {
    if (sharingCamera) {
        stopCamera();
    } else {
        startCamera();
    }
});

$('#btn-flip-camera').addEventListener('click', flipCamera);

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
    if (e.target.closest('.vr-pip')) return;
    const controls = $('#vr-scale-controls');
    controls.classList.toggle('hidden');
    clearTimeout(vrScaleTimeout);
    if (!controls.classList.contains('hidden')) {
        vrScaleTimeout = setTimeout(() => controls.classList.add('hidden'), 4000);
    }
});

init();
