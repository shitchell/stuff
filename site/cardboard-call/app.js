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

$('#btn-send').addEventListener('click', startSender);
$('#btn-flip-camera').addEventListener('click', flipCamera);
