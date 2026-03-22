// Debug log capture — accessible via window.__logs and debug panel
window.__logs = [];
const _origLog = console.log, _origErr = console.error, _origWarn = console.warn;
console.log = (...a) => { const msg = a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(msg); if (window.__logs.length > 1000) window.__logs.shift(); _origLog.apply(console, a); };
console.error = (...a) => { const msg = '[ERR] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(msg); if (window.__logs.length > 1000) window.__logs.shift(); _origErr.apply(console, a); };
console.warn = (...a) => { const msg = '[WARN] ' + a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' '); window.__logs.push(msg); if (window.__logs.length > 1000) window.__logs.shift(); _origWarn.apply(console, a); };

const $ = (sel) => document.querySelector(sel);

const landing = $('#landing');
const senderSection = $('#sender');
const receiverSection = $('#receiver');

function showSection(section) {
    console.log('[UI] showSection:', section.id);
    [landing, senderSection, receiverSection].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

// Generate a short room code like "ABCD-1234"
function generateRoomCode() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O to avoid confusion
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += digits[Math.floor(Math.random() * digits.length)];
    console.log('[ROOM] Generated room code:', code);
    return code;
}

let peer = null;
let currentCall = null;   // used by receiver
let activeCalls = [];      // used by sender — tracks all connected receivers
let localStream = null;
let senderRetries = 0;
const MAX_SENDER_RETRIES = 5;
let currentFacingMode = 'environment';
let flipping = false;
let connected = false;
let receivedStream = null;
let connectTimeout = null;
let pcCheckInterval = null;

// ICE servers config — includes self-hosted TURN for NAT traversal between mobile devices
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:155.138.200.212:3478' },
    {
        urls: 'turn:155.138.200.212:3478',
        username: 'cardboard',
        credential: 'cardboard2026'
    },
    {
        urls: 'turn:155.138.200.212:3478?transport=tcp',
        username: 'cardboard',
        credential: 'cardboard2026'
    },
];

function logStreamInfo(label, stream) {
    if (!stream) {
        console.log(`[STREAM] ${label}: null/undefined`);
        return;
    }
    const tracks = stream.getTracks();
    console.log(`[STREAM] ${label}: id=${stream.id}, active=${stream.active}, tracks=${tracks.length}`);
    tracks.forEach((t, i) => {
        console.log(`[STREAM]   track[${i}]: kind=${t.kind}, enabled=${t.enabled}, muted=${t.muted}, readyState=${t.readyState}, id=${t.id}`);
        if (t.kind === 'video') {
            const settings = t.getSettings();
            console.log(`[STREAM]   track[${i}] settings: ${JSON.stringify(settings)}`);
        }
    });
}

function logVideoElement(label, el) {
    console.log(`[VIDEO] ${label}: readyState=${el.readyState}, paused=${el.paused}, ended=${el.ended}, muted=${el.muted}, srcObject=${!!el.srcObject}, videoWidth=${el.videoWidth}, videoHeight=${el.videoHeight}, currentTime=${el.currentTime}, networkState=${el.networkState}`);
}

function updateSenderStatus(statusEl) {
    const count = activeCalls.length;
    if (count === 0) {
        statusEl.textContent = 'Waiting for receiver...';
        statusEl.className = 'status waiting';
    } else {
        statusEl.textContent = `Connected! (${count} receiver${count > 1 ? 's' : ''})`;
        statusEl.className = 'status connected';
    }
}

async function startSender() {
    console.log('[SENDER] startSender called');
    showSection(senderSection);
    const statusEl = $('#sender-status');
    statusEl.textContent = 'Starting camera...';
    statusEl.className = 'status waiting';

    // Get camera (skip if we already have a valid stream, e.g. on retry)
    if (!localStream || !localStream.active) {
        try {
            console.log('[SENDER] Requesting camera with facingMode:', currentFacingMode);
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode },
                audio: false
            });
            console.log('[SENDER] Got camera stream');
            logStreamInfo('localStream', localStream);
            $('#sender-preview').srcObject = localStream;
            checkCameraCount();
        } catch (err) {
            console.error('[SENDER] Camera error:', err);
            statusEl.textContent = 'Camera access required to send video.';
            statusEl.className = 'status error';
            return;
        }
    } else {
        $('#sender-preview').srcObject = localStream;
        checkCameraCount();
    }

    // Create peer with room code as ID
    const roomCode = generateRoomCode();
    statusEl.textContent = 'Connecting to signaling server...';

    console.log('[SENDER] Creating peer with id:', roomCode);
    if (peer) {
        console.log('[SENDER] Destroying existing peer');
        peer.destroy();
    }
    peer = new Peer(roomCode, { config: { iceServers: ICE_SERVERS } });

    peer.on('open', (id) => {
        console.log('[SENDER] Peer open, id:', id);
        statusEl.textContent = 'Waiting for receiver...';
        statusEl.className = 'status waiting';
        $('#room-code').textContent = id;
        generateQR(id);
    });

    peer.on('error', (err) => {
        console.error('[SENDER] Peer error:', err.type, err);
        if (err.type === 'unavailable-id') {
            senderRetries++;
            if (senderRetries > MAX_SENDER_RETRIES) {
                statusEl.textContent = 'Could not create room. Try again.';
                statusEl.className = 'status error';
                return;
            }
            peer.destroy();
            return startSender();
        }
        statusEl.textContent = 'Connection failed. Try again.';
        statusEl.className = 'status error';
    });

    peer.on('call', (call) => {
        console.log('[SENDER] Incoming call from peer:', call.peer);
        activeCalls.push(call);
        console.log('[SENDER] Answering call with localStream, total receivers:', activeCalls.length);
        logStreamInfo('localStream (answering with)', localStream);
        call.answer(localStream);
        updateSenderStatus(statusEl);
        $('#sender-info').style.opacity = '0.3';

        call.on('stream', (remoteStream) => {
            console.log('[SENDER] Received remote stream from receiver (expected empty)');
            logStreamInfo('sender received remoteStream', remoteStream);
        });

        call.on('close', () => {
            console.log('[SENDER] Call closed from peer:', call.peer);
            activeCalls = activeCalls.filter(c => c !== call);
            console.log('[SENDER] Remaining receivers:', activeCalls.length);
            updateSenderStatus(statusEl);
            if (activeCalls.length === 0) {
                $('#sender-info').style.opacity = '1';
            }
        });

        call.on('error', (err) => {
            console.error('[SENDER] Call error:', err);
            activeCalls = activeCalls.filter(c => c !== call);
            updateSenderStatus(statusEl);
        });
    });

    peer.on('disconnected', () => {
        console.log('[SENDER] Peer disconnected from signaling server, reconnecting...');
        if (!peer.destroyed) peer.reconnect();
    });

    peer.on('close', () => {
        console.log('[SENDER] Peer closed');
    });
}

function generateQR(roomCode) {
    const container = $('#qr-code');
    container.innerHTML = '';
    const baseUrl = window.location.origin + window.location.pathname;
    const url = baseUrl + '?room=' + encodeURIComponent(roomCode);
    console.log('[QR] Generating QR for URL:', url);

    try {
        new QRCode(container, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#ffffff',
            colorLight: '#111111',
        });
        console.log('[QR] QR code generated successfully');
    } catch (err) {
        console.error('[QR] Error generating QR:', err);
    }
}

async function flipCamera() {
    if (flipping) return;
    flipping = true;
    try {
        console.log('[CAMERA] Flipping from', currentFacingMode);
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode },
                audio: false
            });
            console.log('[CAMERA] Got new stream with facingMode:', currentFacingMode);
            logStreamInfo('new localStream', localStream);
            $('#sender-preview').srcObject = localStream;

            // Replace track on all active receiver calls
            const newTrack = localStream.getVideoTracks()[0];
            activeCalls.forEach((call, i) => {
                if (call.peerConnection) {
                    const sender = call.peerConnection.getSenders()
                        .find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        console.log(`[CAMERA] Replacing track on call ${i} (${call.peer})`);
                        sender.replaceTrack(newTrack);
                    }
                }
            });
        } catch (err) {
            console.error('[CAMERA] Flip failed:', err);
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        }
    } finally {
        flipping = false;
    }
}

async function checkCameraCount() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        console.log('[CAMERA] Found', cameras.length, 'cameras');
        if (cameras.length < 2) {
            $('#btn-flip-camera').classList.add('hidden');
        }
    } catch {
        console.log('[CAMERA] Could not enumerate devices');
    }
}

function startReceiver(prefillCode) {
    console.log('[RECEIVER] startReceiver called, prefillCode:', prefillCode);
    showSection(receiverSection);

    if (prefillCode) {
        $('#room-input').value = prefillCode;
    }
}

async function connectToSender() {
    if (connectTimeout) clearTimeout(connectTimeout);
    if (pcCheckInterval) { clearInterval(pcCheckInterval); pcCheckInterval = null; }

    const roomCode = $('#room-input').value.trim();
    const statusEl = $('#receiver-status');

    console.log('[RECEIVER] connectToSender called, roomCode:', roomCode);

    if (!roomCode) {
        statusEl.textContent = 'Enter a room code.';
        statusEl.className = 'status error';
        return;
    }

    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status waiting';
    connected = false;
    receivedStream = null;

    if (peer) {
        console.log('[RECEIVER] Destroying existing peer');
        peer.destroy();
    }
    peer = new Peer(undefined, { config: { iceServers: ICE_SERVERS } });

    peer.on('open', (id) => {
        console.log('[RECEIVER] Peer open, my id:', id);
        console.log('[RECEIVER] Calling sender at:', roomCode);

        const emptyStream = createEmptyStream();
        logStreamInfo('emptyStream (calling with)', emptyStream);

        const call = peer.call(roomCode, emptyStream);
        currentCall = call;
        console.log('[RECEIVER] Call initiated, call object:', !!call);

        if (!call) {
            console.error('[RECEIVER] peer.call returned null/undefined!');
            statusEl.textContent = 'Connection failed.';
            statusEl.className = 'status error';
            return;
        }

        call.on('stream', (remoteStream) => {
            console.log('[RECEIVER] *** STREAM EVENT FIRED ***');
            logStreamInfo('received remoteStream', remoteStream);
            connected = true;
            if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
            receivedStream = remoteStream;
            enterStereoView(remoteStream);
        });

        call.on('close', () => {
            console.log('[RECEIVER] Call closed');
            exitStereoView();
            statusEl.textContent = 'Disconnected.';
            statusEl.className = 'status error';
        });

        call.on('error', (err) => {
            console.error('[RECEIVER] Call error:', err);
            statusEl.textContent = 'Connection failed.';
            statusEl.className = 'status error';
        });

        // Monitor the peer connection directly
        if (call.peerConnection) {
            console.log('[RECEIVER] peerConnection exists immediately');
            monitorPeerConnection(call.peerConnection);
        } else {
            console.log('[RECEIVER] peerConnection not yet available, waiting...');
            // PeerJS may set it up after a tick
            pcCheckInterval = setInterval(() => {
                if (call.peerConnection) {
                    console.log('[RECEIVER] peerConnection now available');
                    monitorPeerConnection(call.peerConnection);
                    clearInterval(pcCheckInterval);
                    pcCheckInterval = null;
                }
            }, 100);
            setTimeout(() => { if (pcCheckInterval) { clearInterval(pcCheckInterval); pcCheckInterval = null; } }, 5000);
        }

        connectTimeout = setTimeout(() => {
            if (connected) return;
            console.log('[RECEIVER] Timeout reached, connected=false');
            statusEl.textContent = 'Room not found. Check the code.';
            statusEl.className = 'status error';
        }, 10000);
    });

    peer.on('error', (err) => {
        console.error('[RECEIVER] Peer error:', err.type, err);
        statusEl.textContent = 'Connection failed. Try again.';
        statusEl.className = 'status error';
    });

    peer.on('disconnected', () => {
        console.log('[RECEIVER] Peer disconnected from signaling server');
    });
}

function monitorPeerConnection(pc) {
    console.log('[RTC] connectionState:', pc.connectionState);
    console.log('[RTC] iceConnectionState:', pc.iceConnectionState);
    console.log('[RTC] signalingState:', pc.signalingState);

    // Use addEventListener to avoid clobbering PeerJS's internal ontrack handler
    pc.addEventListener('track', (event) => {
        console.log('[RTC] *** ontrack event ***');
        console.log('[RTC] track kind:', event.track.kind, 'readyState:', event.track.readyState);
        console.log('[RTC] streams:', event.streams.length);
        event.streams.forEach((s, i) => logStreamInfo(`ontrack stream[${i}]`, s));
    });

    pc.addEventListener('connectionstatechange', () => {
        console.log('[RTC] connectionState changed:', pc.connectionState);
    });

    pc.addEventListener('iceconnectionstatechange', () => {
        console.log('[RTC] iceConnectionState changed:', pc.iceConnectionState);
    });

    pc.addEventListener('signalingstatechange', () => {
        console.log('[RTC] signalingState changed:', pc.signalingState);
    });

    pc.addEventListener('icecandidate', (event) => {
        console.log('[RTC] ICE candidate:', event.candidate ? event.candidate.type : 'null (gathering done)');
    });

    // Log receivers
    const receivers = pc.getReceivers();
    console.log('[RTC] receivers:', receivers.length);
    receivers.forEach((r, i) => {
        console.log(`[RTC] receiver[${i}]: track.kind=${r.track?.kind}, track.readyState=${r.track?.readyState}`);
    });
}

// PeerJS requires a stream to initiate a call — create a minimal video stream
let emptyStream = null;
function createEmptyStream() {
    if (emptyStream) return emptyStream;
    console.log('[STREAM] Creating empty canvas stream');
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    // Draw a frame so the track has content
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    emptyStream = canvas.captureStream(0);
    logStreamInfo('emptyStream created', emptyStream);
    return emptyStream;
}

function enterStereoView(stream) {
    console.log('[STEREO] enterStereoView called');
    logStreamInfo('stream for stereo', stream);

    const stereoView = $('#stereo-view');
    const connectForm = $('#receiver-connect');
    const playOverlay = $('#play-overlay');

    const videoLeft = $('#video-left');
    const videoRight = $('#video-right');
    videoLeft.srcObject = stream;
    videoRight.srcObject = stream;

    console.log('[STEREO] Set srcObject on both video elements');
    logVideoElement('video-left after srcObject', videoLeft);
    logVideoElement('video-right after srcObject', videoRight);

    // Monitor video element events
    ['video-left', 'video-right'].forEach(id => {
        const v = $(`#${id}`);
        v.onloadedmetadata = () => {
            console.log(`[VIDEO] ${id} loadedmetadata: videoWidth=${v.videoWidth} videoHeight=${v.videoHeight}`);
        };
        v.onloadeddata = () => {
            console.log(`[VIDEO] ${id} loadeddata`);
            logVideoElement(id + ' at loadeddata', v);
        };
        v.onplay = () => console.log(`[VIDEO] ${id} play event`);
        v.onplaying = () => {
            console.log(`[VIDEO] ${id} playing event`);
            logVideoElement(id + ' at playing', v);
        };
        v.onwaiting = () => console.log(`[VIDEO] ${id} waiting event`);
        v.onstalled = () => console.log(`[VIDEO] ${id} stalled event`);
        v.onerror = (e) => console.error(`[VIDEO] ${id} error:`, v.error);
        v.onsuspend = () => console.log(`[VIDEO] ${id} suspend event`);
    });

    // Try autoplay
    const playLeft = videoLeft.play();
    const playRight = videoRight.play();

    if (playLeft) {
        playLeft.then(() => {
            console.log('[STEREO] video-left.play() resolved');
            logVideoElement('video-left after play resolve', videoLeft);
        }).catch(err => {
            console.warn('[STEREO] video-left.play() rejected:', err.name, err.message);
        });
    }
    if (playRight) {
        playRight.then(() => {
            console.log('[STEREO] video-right.play() resolved');
        }).catch(err => {
            console.warn('[STEREO] video-right.play() rejected:', err.name, err.message);
        });
    }

    connectForm.classList.add('hidden');
    stereoView.classList.remove('hidden');

    // Show play overlay — user taps to guarantee playback
    playOverlay.classList.remove('hidden');

    // Go fullscreen
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }

    // Lock to landscape
    try {
        screen.orientation.lock('landscape').catch(() => {});
    } catch {
        // Not supported
    }
}

function handlePlayOverlayTap() {
    console.log('[PLAY] Play overlay tapped');
    const videoLeft = $('#video-left');
    const videoRight = $('#video-right');
    const overlay = $('#play-overlay');

    logVideoElement('video-left before manual play', videoLeft);
    logVideoElement('video-right before manual play', videoRight);
    logStreamInfo('receivedStream at play time', receivedStream);

    // Only re-set srcObject if it's missing (avoids AbortError on pending play)
    if (receivedStream && !videoLeft.srcObject) {
        videoLeft.srcObject = receivedStream;
        console.log('[PLAY] Re-set srcObject on video-left');
    }
    if (receivedStream && !videoRight.srcObject) {
        videoRight.srcObject = receivedStream;
        console.log('[PLAY] Re-set srcObject on video-right');
    }

    const p1 = videoLeft.play();
    const p2 = videoRight.play();

    if (p1) p1.then(() => {
        console.log('[PLAY] video-left play resolved');
        logVideoElement('video-left after manual play', videoLeft);
    }).catch(err => console.error('[PLAY] video-left play error:', err.name, err.message));

    if (p2) p2.then(() => {
        console.log('[PLAY] video-right play resolved');
        logVideoElement('video-right after manual play', videoRight);
    }).catch(err => console.error('[PLAY] video-right play error:', err.name, err.message));

    overlay.classList.add('hidden');
}

function exitStereoView() {
    console.log('[STEREO] exitStereoView called');
    const stereoView = $('#stereo-view');
    const connectForm = $('#receiver-connect');

    stereoView.classList.add('hidden');
    connectForm.classList.remove('hidden');

    $('#video-left').srcObject = null;
    $('#video-right').srcObject = null;

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    try {
        screen.orientation.unlock();
    } catch {
        // Not supported
    }
}

// Scale slider — adjusts stereo video size for headset fit
let scaleHideTimeout = null;
$('#scale-slider').addEventListener('input', (e) => {
    const scale = e.target.value / 100;
    const videos = $('#stereo-videos');
    videos.style.transform = `scale(${scale})`;
    videos.style.transformOrigin = 'center center';
    console.log('[SCALE] Set to', e.target.value + '%');
});

// Tap stereo view to toggle scale controls (but not when play overlay is visible)
$('#stereo-view').addEventListener('click', (e) => {
    const overlay = $('#play-overlay');
    const controls = $('#scale-controls');
    const slider = $('#scale-slider');

    // Don't toggle if play overlay is showing or if tapping the slider itself
    if (!overlay.classList.contains('hidden')) return;
    if (e.target === slider || e.target.closest('#scale-controls')) return;

    controls.classList.toggle('hidden');

    // Auto-hide after 4 seconds
    clearTimeout(scaleHideTimeout);
    if (!controls.classList.contains('hidden')) {
        scaleHideTimeout = setTimeout(() => {
            controls.classList.add('hidden');
        }, 4000);
    }
});

$('#btn-send').addEventListener('click', () => {
    senderRetries = 0;
    startSender();
});
$('#btn-flip-camera').addEventListener('click', flipCamera);
$('#btn-receive').addEventListener('click', () => startReceiver());
$('#btn-connect').addEventListener('click', connectToSender);
$('#play-overlay').addEventListener('click', handlePlayOverlayTap);

// Allow Enter key in room input
$('#room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToSender();
});

window.addEventListener('pagehide', () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peer && !peer.destroyed) peer.destroy();
});

// Check URL params on load
(function init() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    console.log('[INIT] URL params:', { room });
    if (room) {
        startReceiver(room);
    }
})();
