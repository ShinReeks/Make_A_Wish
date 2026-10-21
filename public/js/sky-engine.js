/**
 * Starlight Sky - Sky Engine
 *
 * Infinite 2D pan/zoom night sky canvas with parallax layers, shooting stars,
 * constellations, auroras, nebulae, custom pixel stars, and click detection.
 */

class SkyEngine {
  constructor(canvasEl, overlayEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { alpha: false });
    this.overlay = overlayEl;

    this.cx = 0;
    this.cy = 0;
    this.zoom = 1;
    this.targetZoom = 1;

    this.width = 0;
    this.height = 0;
    this.cxScreen = 0;
    this.cyScreen = 0;

    this.isDragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.dragStart = { cx: 0, cy: 0, x: 0, y: 0 };

    this.lastTime = performance.now();

    this.stars = [];
    this.bgStars = [];
    this.fgStars = [];
    this.shootingStars = [];
    this.constellations = [];
    this.auroras = [];
    this.nebulae = [];

    this.seed = Math.random() * 10000;
    this.bgStarCount = 420;
    this.fgStarCount = 60;
    this.auroraTime = 0;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.animate = this.animate.bind(this);

    this.init();
  }

  init() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.generateBgStars();
    this.generateFgStars();
    this.generateConstellations();
    this.generateNebulae();
    this.generateAuroras();

    this.lastTime = performance.now();
    requestAnimationFrame(this.animate);
  }

  handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cxScreen = this.width / 2;
    this.cyScreen = this.height / 2;
  }

  wx(wx) { return (wx - this.cx) * this.zoom + this.cxScreen; }
  wy(wy) { return (wy - this.cy) * this.zoom + this.cyScreen; }
  sx(sx) { return (sx - this.cxScreen) / this.zoom + this.cx; }
  sy(sy) { return (sy - this.cyScreen) / this.zoom + this.cy; }

  lcg() {
    this.seed = (this.seed * 16807 + 12345) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  rand(min, max) { return min + this.lcg() * (max - min); }

  generateBgStars() {
    this.bgStars = [];
    const save = this.seed;
    this.seed = 1001;
    for (let i = 0; i < this.bgStarCount; i++) {
      this.bgStars.push({
        x: this.rand(-4000, 4000), y: this.rand(-3000, 3000),
        size: this.rand(0.4, 1.6), alpha: this.rand(0.15, 0.9),
        twinkle: this.rand(0, 6.28), twinkleSpeed: this.rand(0.0015, 0.006),
        color: this.pickBgColor(), parallax: 0.15,
      });
    }
    this.seed = save;
  }

  pickBgColor() {
    const r = this.lcg();
    if (r < 0.7) return '#ffffff';
    if (r < 0.85) return '#dbe9ff';
    if (r < 0.94) return '#ffd6cc';
    return '#c7d2fe';
  }

  generateFgStars() {
    this.fgStars = [];
    const save = this.seed;
    this.seed = 2002;
    for (let i = 0; i < this.fgStarCount; i++) {
      this.fgStars.push({
        x: this.rand(-2500, 2500), y: this.rand(-2000, 2000),
        size: this.rand(1.5, 3.5), alpha: this.rand(0.4, 1),
        twinkle: this.rand(0, 6.28), twinkleSpeed: this.rand(0.003, 0.01),
        color: '#ffffff', parallax: 0.5,
      });
    }
    this.seed = save;
  }

  generateConstellations() {
    this.constellations = [];
    const save = this.seed;
    this.seed = 3003;
    for (let c = 0; c < 14; c++) {
      const cx = this.rand(-3000, 3000), cy = this.rand(-2200, 2200);
      const pts = [], n = 3 + Math.floor(this.rand(0, 5));
      let px = cx, py = cy;
      for (let p = 0; p < n; p++) {
        px += this.rand(-420, 420); py += this.rand(-300, 300);
        pts.push({ x: px, y: py });
      }
      this.constellations.push({ points: pts, color: '#6366f1', alpha: 0.35 });
    }
    this.seed = save;
  }

  generateNebulae() {
    this.nebulae = [];
    const save = this.seed;
    this.seed = 4004;
    for (let i = 0; i < 5; i++) {
      this.nebulae.push({
        x: this.rand(-3200, 3200), y: this.rand(-2400, 2400),
        rx: this.rand(450, 900), ry: this.rand(250, 550), rot: this.rand(0, 6.28),
        color: i % 2 === 0 ? 'rgba(139, 92, 246, 0.06)' : 'rgba(16, 185, 129, 0.05)',
        parallax: 0.3,
      });
    }
    this.seed = save;
  }

  generateAuroras() {
    this.auroras = [];
    const save = this.seed;
    this.seed = 5005;
    for (let i = 0; i < 6; i++) {
      this.auroras.push({
        x: this.rand(-2600, 2600), y: this.rand(-1800, 1800),
        w: this.rand(500, 1200), h: this.rand(120, 300),
        color: i % 2 === 0 ? 'rgba(16, 185, 129, 0.0)' : 'rgba(139, 92, 246, 0.0)',
        speed: this.rand(0.0008, 0.002), offset: this.rand(0, 6.28), parallax: 0.4,
      });
    }
    this.seed = save;
  }

  // -----------------------------------------------------------------------
  // Shooting stars
  // -----------------------------------------------------------------------
  spawnShootingStar() {
    if (Math.random() > 0.015) return;
    const x = this.rand(-1800, 1800);
    const y = this.rand(-1400, 400);
    const dx = this.rand(1.2, 2.6);
    const dy = this.rand(0.6, 1.4);
    this.shootingStars.push({ x, y, dx, dy, life: 1, len: this.rand(60, 140) });
  }

  updateShootingStars(dt) {
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.x += s.dx;
      s.y += s.dy;
      s.life -= dt * 0.8;
      if (s.life <= 0 || s.y > 2200) this.shootingStars.splice(i, 1);
    }
    if (Math.random() < 0.02) this.spawnShootingStar();
  }

  // -----------------------------------------------------------------------
  // Render loop
  // -----------------------------------------------------------------------
  animate(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.auroraTime += dt * 0.5;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.cx += Math.sin(now * 0.0003) * 0.15;
    this.cy += Math.cos(now * 0.0004) * 0.1;
    this.zoom += (this.targetZoom - this.zoom) * 0.06;
    this.drawDeepSky();
    this.drawParallaxStars();
    this.drawConstellations();
    this.updateShootingStars(dt);
    this.drawShootingStars();
    this.drawPlacedStars();
    requestAnimationFrame(this.animate);
  }

  drawDeepSky() {
    this.nebulae.forEach((neb) => {
      const wx = neb.x * neb.parallax;
      const wy = neb.y * neb.parallax;
      this.ctx.save();
      this.ctx.translate(this.wx(wx), this.wy(wy));
      this.ctx.rotate(neb.rot);
      const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(neb.rx, neb.ry));
      grad.addColorStop(0, neb.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, neb.rx * this.zoom, neb.ry * this.zoom, 0, 0, 6.28);
      this.ctx.fill();
      this.ctx.restore();
    });
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.auroras.forEach((aur, i) => {
      const phase = this.auroraTime * aur.speed + aur.offset;
      const wave = Math.sin(phase) * 0.5 + 0.5;
      const alpha = 0.035 + wave * 0.025;
      const cx = aur.x * aur.parallax + Math.sin(phase * 0.7) * 60;
      const cy = aur.y * aur.parallax + Math.cos(phase * 0.5) * 40;
      const grad = this.ctx.createLinearGradient(
        this.wx(cx - aur.w * 0.5), this.wy(cy),
        this.wx(cx + aur.w * 0.5), this.wy(cy)
      );
      grad.addColorStop(0, aur.color.replace('0.0)', `${alpha})`));
      grad.addColorStop(0.5, aur.color.replace('0.0)', `${alpha * 1.6})`));
      grad.addColorStop(1, aur.color.replace('0.0)', `${alpha})`));
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.ellipse(this.wx(cx), this.wy(cy), aur.w * this.zoom * 0.5, aur.h * this.zoom, 0, 0, 6.28);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  drawParallaxStars() {
    const drawLayer = (stars, parallax, baseSize) => {
      this.ctx.save();
      stars.forEach((s) => {
        const tw = Math.sin(nowTime() + s.twinkle) * 0.5 + 0.5;
        const alpha = s.alpha * (0.5 + tw * 0.5);
        const sx = this.wx(s.x * parallax);
        const sy = this.wy(s.y * parallax);
        if (sx < -50 || sy < -50 || sx > this.width + 50 || sy > this.height + 50) return;
        this.ctx.fillStyle = s.color;
        this.ctx.globalAlpha = alpha;
        const size = (s.size * baseSize) * this.zoom;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, size, 0, 6.28);
        this.ctx.fill();
      });
      this.ctx.restore();
    };
    drawLayer(this.bgStars, 0.15, 1);
    drawLayer(this.fgStars, 0.5, 1.2);
  }

  drawConstellations() {
    this.ctx.save();
    this.ctx.strokeStyle = '#6366f1';
    this.ctx.lineWidth = 1 * this.zoom;
    this.constellations.forEach((con) => {
      const alpha = con.alpha * (0.6 + Math.sin(nowTime() * 0.5) * 0.2);
      this.ctx.globalAlpha = alpha;
      this.ctx.beginPath();
      con.points.forEach((p, i) => {
        const spx = this.wx(p.x * 0.3);
        const spy = this.wy(p.y * 0.3);
        if (i === 0) this.ctx.moveTo(spx, spy);
        else this.ctx.lineTo(spx, spy);
      });
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawShootingStars() {
    this.ctx.save();
    this.ctx.strokeStyle = '#e0e7ff';
    this.ctx.lineCap = 'round';
    this.shootingStars.forEach((s) => {
      this.ctx.globalAlpha = s.life;
      const x1 = this.wx(s.x), y1 = this.wy(s.y);
      const x2 = this.wx(s.x - s.dx * 12), y2 = this.wy(s.y - s.dy * 12);
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.lineWidth = 1.5 * this.zoom;
      this.ctx.stroke();
      this.ctx.fillStyle = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(x1, y1, 2 * this.zoom, 0, 6.28);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  drawPlacedStars() {
    this.stars.forEach((star) => {
      if (star.timeCapsule && new Date(star.timeCapsule) > new Date()) return;
      this.drawPixelStar(star);
    });
  }

  drawPixelStar(star) {
    const sx = this.wx(star.x);
    const sy = this.wy(star.y);
    const pad = 60;
    if (sx < -pad || sy < -pad || sx > this.width + pad || sy > this.height + pad) return;
    const glow = 18 + star.glow * 40;
    const grad = this.ctx.createRadialGradient(sx, sy, 0, sx, sy, glow);
    grad.addColorStop(0, `rgba(255,255,255,${0.9 * star.glow})`);
    grad.addColorStop(0.4, `rgba(255,255,255,${0.35 * star.glow})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, glow, 0, 6.28);
    this.ctx.fill();
    this.ctx.save();
    this.ctx.translate(sx, sy);
    this.ctx.scale(star.glow * 0.6 + 0.6, star.glow * 0.6 + 0.6);
    const pd = star.pixelData || [[1]];
    const cell = 4;
    const rows = pd.length;
    const cols = pd[0] ? pd[0].length : 1;
    const half = (cols * cell) / 2;
    this.ctx.fillStyle = star.color || '#ffffff';
    this.ctx.globalAlpha = 0.95;
    for (let r = 0; r < rows; r++) {
      const row = pd[r];
      if (!row) continue;
      for (let c = 0; c < cols; c++) {
        if (row[c]) {
          this.ctx.fillRect(c * cell - half, r * cell - half, cell - 1, cell - 1);
        }
      }
    }
    this.ctx.restore();
    this.ctx.fillStyle = 'rgba(255,255,255,0.55)';
    this.ctx.font = '10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`(${Math.round(star.x)},${Math.round(star.y)})`, sx, sy - glow - 8);
  }

  getStarAt(screenX, screenY) {
    let hit = null;
    let bestDist = Infinity;
    const worldX = this.sx(screenX);
    const worldY = this.sy(screenY);
    this.stars.forEach((star) => {
      if (star.timeCapsule && new Date(star.timeCapsule) > new Date()) return;
      const dx = worldX - star.x;
      const dy = worldY - star.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = (12 + star.glow * 20) / this.zoom;
      if (dist <= hitRadius && dist < bestDist) {
        bestDist = dist;
        hit = star;
      }
    });
    return hit;
  }

  // -----------------------------------------------------------------------
  // Input: pan / zoom
  // -----------------------------------------------------------------------
  handlePointerDown(e) {
    this.isDragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dragStart = { cx: this.cx, cy: this.cy, x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = 'grabbing';
  }

  handlePointerMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    // Pan the world opposite to pointer movement
    this.cx = this.dragStart.cx - dx / this.zoom;
    this.cy = this.dragStart.cy - dy / this.zoom;
  }

  handlePointerUp() {
    this.isDragging = false;
    this.canvas.style.cursor = 'default';
  }

  handleWheel(e) {
    e.preventDefault();
    const mx = e.clientX;
    const my = e.clientY;
    const worldBefore = { x: this.sx(mx), y: this.sy(my) };
    const delta = -e.deltaY * 0.0015;
    this.targetZoom = Math.min(Math.max(this.targetZoom * Math.exp(delta), 0.25), 4);
    // Keep the point under the cursor fixed while zooming
    const worldAfter = { x: this.sx(mx), y: this.sy(my) };
    this.cx += worldAfter.x - worldBefore.x;
    this.cy += worldAfter.y - worldBefore.y;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  addStar(star) {
    this.stars.push(star);
  }

  zoomTo(z) {
    this.targetZoom = Math.min(Math.max(z, 0.25), 4);
  }

  centerOn(wx, wy) {
    this.cx = wx;
    this.cy = wy;
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }
}

// Module-level time helper (hoisted, safe to call from methods above)
function nowTime() {
  return performance.now();
}