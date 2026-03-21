const $ = (sel) => document.querySelector(sel);

const landing = $('#landing');
const senderSection = $('#sender');
const receiverSection = $('#receiver');

function showSection(section) {
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
    return code;
}

let peer = null;
let currentCall = null;
let localStream = null;
let currentFacingMode = 'environment';
let connected = false;

async function startSender() {
    showSection(senderSection);
    const statusEl = $('#sender-status');
    statusEl.textContent = 'Starting camera...';
    statusEl.className = 'status waiting';

    // Get camera
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: false
        });
        $('#sender-preview').srcObject = localStream;
        checkCameraCount();
    } catch (err) {
        statusEl.textContent = 'Camera access required to send video.';
        statusEl.className = 'status error';
        return;
    }

    // Create peer with room code as ID
    const roomCode = generateRoomCode();
    statusEl.textContent = 'Connecting to signaling server...';

    peer = new Peer(roomCode);

    peer.on('open', (id) => {
        statusEl.textContent = 'Waiting for receiver...';
        statusEl.className = 'status waiting';
        $('#room-code').textContent = id;
        generateQR(id);
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            // Room code collision — try again
            peer.destroy();
            startSender();
            return;
        }
        statusEl.textContent = 'Connection failed. Try again.';
        statusEl.className = 'status error';
    });

    peer.on('call', (call) => {
        currentCall = call;
        call.answer(localStream);
        statusEl.textContent = 'Connected!';
        statusEl.className = 'status connected';
        // Fade out room code and QR
        $('#sender-info').style.opacity = '0.3';

        call.on('close', () => {
            statusEl.textContent = 'Receiver disconnected.';
            statusEl.className = 'status error';
            $('#sender-info').style.opacity = '1';
        });
    });
}

function generateQR(roomCode) {
    const container = $('#qr-code');
    container.innerHTML = '';
    const baseUrl = window.location.origin + window.location.pathname;
    const url = baseUrl + '?room=' + encodeURIComponent(roomCode);

    QRCode.toCanvas(url, { width: 200, margin: 2, color: { dark: '#fff', light: '#111' } },
        (err, canvas) => {
            if (!err) container.appendChild(canvas);
        }
    );
}

async function flipCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

    // Stop old tracks
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: false
        });
        $('#sender-preview').srcObject = localStream;

        // Replace track on active call if connected
        if (currentCall && currentCall.peerConnection) {
            const sender = currentCall.peerConnection.getSenders()
                .find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(localStream.getVideoTracks()[0]);
            }
        }
    } catch (err) {
        // If flip fails (single camera), revert
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    }
}

// Detect if device has multiple cameras — hide flip button if not
async function checkCameraCount() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        if (cameras.length < 2) {
            $('#btn-flip-camera').classList.add('hidden');
        }
    } catch {
        // Can't enumerate — show button anyway
    }
}

function startReceiver(prefillCode) {
    showSection(receiverSection);

    if (prefillCode) {
        $('#room-input').value = prefillCode;
    }
}

async function connectToSender() {
    const roomCode = $('#room-input').value.trim();
    const statusEl = $('#receiver-status');

    if (!roomCode) {
        statusEl.textContent = 'Enter a room code.';
        statusEl.className = 'status error';
        return;
    }

    statusEl.textContent = 'Connecting...';
    statusEl.className = 'status waiting';
    connected = false;

    // Prime video elements during user gesture so they're allowed to play
    const videoLeft = $('#video-left');
    const videoRight = $('#video-right');
    videoLeft.play().catch(() => {});
    videoRight.play().catch(() => {});

    if (peer) {
        peer.destroy();
    }
    peer = new Peer();

    peer.on('open', () => {
        // Call the sender (we send no stream, just receive)
        const call = peer.call(roomCode, createEmptyStream());
        currentCall = call;

        call.on('stream', (remoteStream) => {
            connected = true;
            enterStereoView(remoteStream);
        });

        call.on('close', () => {
            exitStereoView();
            statusEl.textContent = 'Disconnected.';
            statusEl.className = 'status error';
        });

        call.on('error', () => {
            statusEl.textContent = 'Connection failed.';
            statusEl.className = 'status error';
        });

        // Timeout if no stream after 10 seconds
        setTimeout(() => {
            if (connected) return;
            statusEl.textContent = 'Room not found. Check the code.';
            statusEl.className = 'status error';
        }, 10000);
    });

    peer.on('error', (err) => {
        statusEl.textContent = 'Connection failed. Try again.';
        statusEl.className = 'status error';
    });
}

// PeerJS requires a stream to initiate a call — create a minimal video stream
let emptyStream = null;
function createEmptyStream() {
    if (emptyStream) return emptyStream;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    emptyStream = canvas.captureStream(0);
    return emptyStream;
}

function enterStereoView(stream) {
    const stereoView = $('#stereo-view');
    const connectForm = $('#receiver-connect');

    const videoLeft = $('#video-left');
    const videoRight = $('#video-right');
    videoLeft.srcObject = stream;
    videoRight.srcObject = stream;
    // Re-trigger play now that stream is attached
    videoLeft.play().catch(() => {});
    videoRight.play().catch(() => {});

    connectForm.classList.add('hidden');
    stereoView.classList.remove('hidden');

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

function exitStereoView() {
    const stereoView = $('#stereo-view');
    const connectForm = $('#receiver-connect');

    stereoView.classList.add('hidden');
    connectForm.classList.remove('hidden');

    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    // Unlock orientation
    try {
        screen.orientation.unlock();
    } catch {
        // Not supported
    }
}

$('#btn-send').addEventListener('click', startSender);
$('#btn-flip-camera').addEventListener('click', flipCamera);
$('#btn-receive').addEventListener('click', () => startReceiver());
$('#btn-connect').addEventListener('click', connectToSender);
$('#stereo-view').addEventListener('click', exitStereoView);

// Allow Enter key in room input
$('#room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectToSender();
});

// Check URL params on load
(function init() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
        startReceiver(room);
    }
})();
