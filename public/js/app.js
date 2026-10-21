/**
// ---------------------------------------------------------------------------
// REST + placement
// ---------------------------------------------------------------------------
async function placeStar(star, onOk, onErr) {
  try {
    const res = await fetch('/api/stars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(star),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to place star');
    sky.addStar(json.star);
    studio.close();
    if (onOk) onOk(json.star);
  } catch (err) {
    toast(err.message, true);
    if (onErr) onErr(err.message);
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function bindControls() {
  btnZoomIn.addEventListener('click', () => sky.zoomTo(Math.min(sky.targetZoom * 1.4, 4)));
  btnZoomOut.addEventListener('click', () => sky.zoomTo(Math.max(sky.targetZoom / 1.4, 0.25)));
  btnResetView.addEventListener('click', () => {
    sky.cx = 0; sky.cy = 0; sky.zoomTo(1);
  });
  btnOpenStudio.addEventListener('click', () => studio.open());

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const wx = sky.sx(e.clientX - rect.left);
    const wy = sky.sy(e.clientY - rect.top);
    coordHint.textContent = `X: ${Math.round(wx)}, Y: ${Math.round(wy)}`;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (sky.isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const star = sky.getStarAt(e.clientX - rect.left, e.clientY - rect.top);
    if (star) {
      openModal(star);
      audioEngine.playStarChime(star.audio, star.id);
    } else {
      closeModal();
    }
  });
}
 * Starlight Sky - Main Application
 * 
 * Orchestrates: SkyEngine, CreatorStudio, CosmicAudioEngine, Socket.io, REST API,
 * star inspection modal, stardust voting, and ambient audio toggle.
 */

import audioEngine from './audio-engine.js';
import SkyEngine from './sky-engine.js';
import CreatorStudio from './creator-studio.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const canvas = document.getElementById('skyCanvas');
const overlay = document.getElementById('sky-overlay');
const coordHint = document.getElementById('coord-hint');
const btnZoomIn = document.getElementById('zoom-in');
const btnZoomOut = document.getElementById('zoom-out');
const btnResetView = document.getElementById('reset-view');
const btnOpenStudio = document.getElementById('open-studio');

const modal = document.getElementById('star-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const btnModalClose = document.getElementById('modal-close');
const btnStardust = document.getElementById('btn-stardust');
const btnPlayChime = document.getElementById('btn-play-chime');
const modalPreview = document.getElementById('modal-star-preview');
const modalTitle = document.getElementById('modal-title');
const modalTag = document.getElementById('modal-tag');
const modalCoords = document.getElementById('modal-coords');
const modalStardust = document.getElementById('modal-stardust');
const modalCreator = document.getElementById('modal-creator');
const modalMessage = document.getElementById('modal-message');
const modalTC = document.getElementById('modal-timecapsule');
const modalTCDate = document.getElementById('modal-tc-date');

const btnAudio = document.getElementById('btn-audio-toggle');
const audioLabel = document.getElementById('audioLabel');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let sky = null;
let studio = null;
let socket = null;
let voterId = null;
let selectedStar = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  voterId = localStorage.getItem('sls_voter') || crypto.randomUUID();
  localStorage.setItem('sls_voter', voterId);

  sky = new SkyEngine(canvas, overlay);
  studio = new CreatorStudio();
  studio.setAudioEngine(audioEngine);

  studio.setOnStarCreated((star, onOk, onErr) => {
    placeStar(star, onOk, onErr);
  });

  audioEngine.bindUnlock([btnOpenStudio, btnAudio, canvas]);

  connectSocket();
  bindControls();
  bindModal();
  bindAudioToggle();

  toast('Welcome to Starlight Sky ✨');
}

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
function connectSocket() {
  socket = io();

  socket.on('sky:init', ({ stars }) => {
    stars.forEach((s) => sky.addStar(s));
  });

  socket.on('star:created', (star) => {
    sky.addStar(star);
    if (star.id !== (selectedStar && selectedStar.id)) {
      toast(`A new star appeared at (${Math.round(star.x)}, ${Math.round(star.y)})`);
    }
  });

  socket.on('star:updated', (star) => {
    const idx = sky.stars.findIndex((s) => s.id === star.id);
    if (idx >= 0) sky.stars[idx] = star;
    if (selectedStar && selectedStar.id === star.id) renderModal(star);
  });

  socket.on('star:deleted', ({ id }) => {
    sky.stars = sky.stars.filter((s) => s.id !== id);
    if (selectedStar && selectedStar.id === id) closeModal();
  });

  socket.on('star:stardust', ({ starId, stardust, voted }) => {
    const star = sky.stars.find((s) => s.id === starId);
    if (star) star.stardust = stardust;
    if (selectedStar && selectedStar.id === starId) {
      selectedStar.stardust = stardust;
      renderStardustUI(stardust, voted);
    }
  });

  socket.on('presence:joined', ({ handle }) => {
    // Lightweight social signal
  });
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function bindModal() {
  btnModalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  btnStardust.addEventListener('click', () => toggleStardust());
  btnPlayChime.addEventListener('click', () => {
    if (selectedStar) audioEngine.playStarChime(selectedStar.audio, selectedStar.id);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function openModal(star) {
  selectedStar = star;
  renderModal(star);
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  selectedStar = null;
  modal.classList.remove('visible');
  modal.setAttribute('aria-hidden', 'true');
}

function renderModal(star) {
  const pctx = document.createElement('canvas').getContext('2d');
  pctx.canvas.width = 64;
  pctx.canvas.height = 64;
  pctx.imageSmoothingEnabled = false;
  const pd = star.pixelData || [[1]];
  const cols = pd[0] ? pd[0].length : 1;
  const cell = 64 / Math.max(pd.length, cols);
  pctx.fillStyle = star.color || '#ffffff';
  for (let r = 0; r < pd.length; r++) {
    for (let c = 0; c < (pd[r] && pd[r].length || 1); c++) {
      if (pd[r][c]) pctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
    }
  }
  modalPreview.style.backgroundImage = `url(${pctx.canvas.toDataURL()})`;
  modalPreview.style.backgroundColor = star.color || '#ffffff';
  modalPreview.style.boxShadow = `0 0 ${24 + star.glow * 40}px ${star.color || '#ffffff'}`;

  modalTitle.textContent = `"${star.message}"`;
  modalTag.textContent = star.tag;
  modalTag.className = `modal-tag tag-${star.tag.toLowerCase()}`;
  modalCoords.textContent = `(${star.x}, ${star.y})`;
  modalCreator.innerHTML = `by <span id="modal-creator-name">${escapeHtml(star.creator)}</span>`;
  modalMessage.textContent = star.message;
  modalStardust.textContent = `${star.stardust || 0} ✨`;

  if (star.timeCapsule) {
    modalTC.hidden = false;
    modalTCDate.textContent = new Date(star.timeCapsule).toLocaleString();
  } else {
    modalTC.hidden = true;
  }
  renderStardustUI(star.stardust || 0, false);
}

function renderStardustUI(count, voted) {
  modalStardust.textContent = `${count} ✨`;
  const txt = btnStardust.querySelector('#stardust-text');
  if (voted) {
    btnStardust.classList.add('voted');
    txt.textContent = 'Stardust Sent';
  } else {
    btnStardust.classList.remove('voted');
    txt.textContent = 'Send Stardust';
  }
}

async function toggleStardust() {
  if (!selectedStar) return;
  try {
    const res = await fetch(`/api/stars/${selectedStar.id}/stardust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Vote failed');
    selectedStar.stardust = json.stardust;
    renderStardustUI(json.stardust, json.voted);
    if (socket) socket.emit('star:stardust', { starId: selectedStar.id, voterId });
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------------------------------------------------------------------------
// Audio toggle
// ---------------------------------------------------------------------------
function bindAudioToggle() {
  btnAudio.addEventListener('click', () => {
    const on = audioEngine.toggle();
    audioLabel.textContent = `Ambient Audio: ${on ? 'On' : 'Off'}`;
    btnAudio.setAttribute('aria-pressed', on);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  if (isErr) el.style.color = '#f87171';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();