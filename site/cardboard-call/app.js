const $ = (sel) => document.querySelector(sel);

const landing = $('#landing');
const senderSection = $('#sender');
const receiverSection = $('#receiver');

function showSection(section) {
    [landing, senderSection, receiverSection].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}
