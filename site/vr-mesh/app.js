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

init();
