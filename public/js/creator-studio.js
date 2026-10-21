/**
 * Starlight Sky - Star Creator Studio
 * 
 * Pixel/grid drawing canvas + submission form for creating a custom star.
 * Exposes an open/close API and a onStarCreated(callback) hook consumed by app.js.
 */

class CreatorStudio {
  constructor() {
    this.panel = document.getElementById('creator-studio');
    this.backdrop = document.getElementById('studio-backdrop');
    this.card = this.panel.querySelector('.studio-card');
    this.form = document.getElementById('star-form');
    this.canvas = document.getElementById('pixelCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Drawing state
    this.gridSize = 16;
    this.cell = this.canvas.width / this.gridSize; // 1 px per cell in canvas coords
    this.pixels = new Uint8Array(this.gridSize * this.gridSize * 4); // RGBA
    this.tool = 'draw';      // draw | erase | fill
    this.color = '#ffffff';
    this.glow = 0.6;

    // Form refs
    this.creatorInput = document.getElementById('creatorName');
    this.messageInput = document.getElementById('starMessage');
    this.tagSelect = document.getElementById('starTag');
    this.timeCapsuleInput = document.getElementById('timeCapsule');
    this.glowRange = document.getElementById('glowRange');
    this.glowVal = document.getElementById('glowVal');
    this.colorInput = document.getElementById('starColor');
    this.status = document.getElementById('form-status');

    // Chime refs
    this.chimeWave = document.getElementById('chimeWave');
    this.chimeFreq = document.getElementById('chimeFreq');
    this.chimeFreqVal = document.getElementById('chimeFreqVal');
    this.btnTestChime = document.getElementById('btnTestChime');

    // External audio engine + callback
    this.audioEngine = null;
    this.onStarCreated = null;

    this.isDrawing = false;

    this.bindUI();
    this.clearGrid();
    this.renderGrid();
  }

  // -----------------------------------------------------------------------
  // Audio engine wiring
  // -----------------------------------------------------------------------
  setAudioEngine(engine) {
    this.audioEngine = engine;
  }

  setOnStarCreated(callback) {
    this.onStarCreated = callback;
  }

  // -----------------------------------------------------------------------
  // Open / close
  // -----------------------------------------------------------------------
  open() {
    this.panel.hidden = false;
    // Next frame so transition CSS applies
    requestAnimationFrame(() => this.panel.classList.add('visible'));
    this.panel.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.panel.classList.remove('visible');
    this.panel.setAttribute('aria-hidden', 'true');
    setTimeout(() => { this.panel.hidden = true; }, 350);
  }

  // -----------------------------------------------------------------------
  // UI binding
  // -----------------------------------------------------------------------
  bindUI() {
    // Close
    document.getElementById('close-studio').addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());

    // Tools
    this.panel.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
      });
    });

    // Glow
    this.glowRange.addEventListener('input', (e) => {
      this.glow = parseFloat(e.target.value);
      this.glowVal.textContent = this.glow;
    });

    // Color
    this.colorInput.addEventListener('input', (e) => {
      this.color = e.target.value;
    });

    // Clear
    document.getElementById('clearCanvas').addEventListener('click', () => {
      this.clearGrid();
      this.renderGrid();
    });

    // Chime test
    this.chimeFreq.addEventListener('input', (e) => {
      this.chimeFreqVal.textContent = e.target.value + ' Hz';
    });
    this.btnTestChime.addEventListener('click', () => {
      this.testChime();
    });

    // Form submit
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    // Pixel canvas interaction
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', () => { this.isDrawing = false; });
    this.canvas.addEventListener('pointerleave', () => { this.isDrawing = false; });
  }

  // -----------------------------------------------------------------------
  // Pixel grid drawing
  // -----------------------------------------------------------------------
  getCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    return { x: Math.min(Math.max(x, 0), this.gridSize - 1),
             y: Math.min(Math.max(y, 0), this.gridSize - 1) };
  }

  idx(x, y) { return (y * this.gridSize + x) * 4; }

  setPixel(x, y, active) {
    const i = this.idx(x, y);
    const c = this.hexToRgb(this.color);
    this.pixels[i + 0] = active ? c.r : 0;
    this.pixels[i + 1] = active ? c.g : 0;
    this.pixels[i + 2] = active ? c.b : 0;
    this.pixels[i + 3] = active ? 255 : 0;
  }

  hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 255, b: 255 };
  }

  onPointerDown(e) {
    this.isDrawing = true;
    const cell = this.getCell(e);
    if (this.tool === 'fill') {
      this.floodFill(cell.x, cell.y);
    } else {
      this.setPixel(cell.x, cell.y, this.tool !== 'erase');
    }
    this.renderGrid();
  }

  onPointerMove(e) {
    if (!this.isDrawing) return;
    const cell = this.getCell(e);
    this.setPixel(cell.x, cell.y, this.tool !== 'erase');
    this.renderGrid();
  }

  floodFill(x, y) {
    const target = this.getPixel(x, y);
    const fill = this.hexToRgb(this.color);
    const fillActive = this.tool !== 'erase';
    if (!fillActive && target.a === 0) return;
    const stack = [{ x, y }];
    const visited = new Uint8Array(this.gridSize * this.gridSize);
    while (stack.length) {
      const { x: cx, y: cy } = stack.pop();
      const key = cy * this.gridSize + cx;
      if (visited[key]) continue;
      visited[key] = 1;
      const cur = this.getPixel(cx, cy);
      const same = (cur.r === target.r && cur.g === target.g && cur.b === target.b && cur.a === target.a);
      if (!same) continue;
      this.setPixel(cx, cy, fillActive);
      if (cx > 0) stack.push({ x: cx - 1, y: cy });
      if (cx < this.gridSize - 1) stack.push({ x: cx + 1, y: cy });
      if (cy > 0) stack.push({ x: cx, y: cy - 1 });
      if (cy < this.gridSize - 1) stack.push({ x: cx, y: cy + 1 });
    }
  }

  getPixel(x, y) {
    const i = this.idx(x, y);
    return { r: this.pixels[i], g: this.pixels[i + 1], b: this.pixels[i + 2], a: this.pixels[i + 3] };
  }

  clearGrid() {
    this.pixels.fill(0);
  }

  getPixelData() {
    const rows = [];
    for (let y = 0; y < this.gridSize; y++) {
      const row = [];
      for (let x = 0; x < this.gridSize; x++) {
        const p = this.getPixel(x, y);
        row.push(p.a > 0 ? 1 : 0);
      }
      rows.push(row);
    }
    return rows;
  }

  renderGrid() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= this.gridSize; i++) {
      const p = i * this.cell;
      this.ctx.beginPath();
      this.ctx.moveTo(p, 0); this.ctx.lineTo(p, this.canvas.height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, p); this.ctx.lineTo(this.canvas.width, p);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const p = this.getPixel(x, y);
        if (p.a > 0) {
          this.ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
          this.ctx.fillRect(x * this.cell + 0.5, y * this.cell + 0.5, this.cell - 1, this.cell - 1);
          this.ctx.shadowColor = this.color;
          this.ctx.shadowBlur = 4;
        }
      }
    }
    this.ctx.shadowBlur = 0;
  }

  // -----------------------------------------------------------------------
  // Chime preview
  // -----------------------------------------------------------------------
  testChime() {
    if (!this.audioEngine) return;
    const freq = parseFloat(this.chimeFreq.value);
    const type = this.chimeWave.value;
    this.audioEngine.playStarChime({ freq, type }, '__preview__');
  }

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------
  submit() {
    this.status.textContent = '';
    this.status.className = 'form-status';

    const creator = this.creatorInput.value.trim();
    const message = this.messageInput.value.trim();
    const tag = this.tagSelect.value;
    const timeCapsule = this.timeCapsuleInput.value || null;

    if (!creator) { this.showStatus('Creator handle is required.', 'err'); this.creatorInput.focus(); return; }
    if (!message) { this.showStatus('Please write a message or wish.', 'err'); this.messageInput.focus(); return; }

    const star = {
      creator,
      message,
      tag,
      timeCapsule,
      pixelData: this.getPixelData(),
      glow: this.glow,
      color: this.color,
      audio: { freq: parseFloat(this.chimeFreq.value), type: this.chimeWave.value },
    };

    this.showStatus('Placing star...', 'ok');

    if (this.onStarCreated) {
      this.onStarCreated(star, (placed) => {
        this.showStatus('Star placed in the sky. ✨', 'ok');
        this.form.reset();
        this.clearGrid();
        this.renderGrid();
        this.chimeFreqVal.textContent = this.chimeFreq.value + ' Hz';
      }, (err) => {
        this.showStatus(err || 'Failed to place star.', 'err');
      });
    }
  }

  showStatus(msg, kind) {
    this.status.textContent = msg;
    this.status.className = `form-status ${kind}`;
  }
}