/**
 * Starlight Sky - Cosmic Audio Engine
 *
 * Generative Web Audio API soundscape:
 * - Ambient drone (low sine oscillators with slow LFO)
 * - Occasional celestial chimes (random notes)
 * - Per-star harmonic chime triggered on hover/click
 * - All audio synthesized on-the-fly; no external files.
 *
 * Audio context is suspended until first user gesture (browser autoplay policy).
 */

class CosmicAudioEngine {
  constructor() {
    this.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = null;
    this.enabled = false;
    this.userGesture = false;

    // Ambient nodes
    this.masterGain = null;
    this.droneGain = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneLFO = null;
    this.droneLFOCgain = null;

    // Random note scheduler
    this.chimeTimer = null;

    // Star chime playback tracking (prevent rapid retrigger)
    this.lastChimeStarId = null;
    this.lastChimeTime = 0;
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------
  init() {
    if (this.ctx) return this.ctx;
    this.ctx = new this.AudioContext();

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    return this.ctx;
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve(this.ctx);
  }

  // -----------------------------------------------------------------------
  // Ambient soundscape
  // -----------------------------------------------------------------------
  startAmbient() {
    if (!this.ctx) this.init();
    if (this.enabled) return;
    this.enabled = true;

    const now = this.ctx.currentTime;

    // Low drone oscillators (deep space hum)
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.setValueAtTime(55, now); // A1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.setValueAtTime(82.41, now); // E2 (fifth above)

    // Slow LFO for subtle pitch warble (parallax feel)
    this.droneLFO = this.ctx.createOscillator();
    this.droneLFO.frequency.setValueAtTime(0.05, now); // 1 cycle per 20s
    this.droneLFOCgain = this.ctx.createGain();
    this.droneLFOCgain.gain.setValueAtTime(1.5, now); // small detune amount

    this.droneLFO.connect(this.droneLFOCgain);
    this.droneLFOCgain.connect(this.droneOsc1.detune);
    this.droneLFOCgain.connect(this.droneOsc2.detune);

    // Drone gain envelope (slow swell)
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.18, now + 6);

    this.droneOsc1.connect(this.droneGain);
    this.droneOsc2.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
    this.droneLFO.start(now);

    // Schedule random celestial chimes
    this.scheduleRandomChime();

    this.userGesture = true;
    this.announce('Ambient soundscape enabled');
  }

  stopAmbient() {
    if (!this.enabled) return;
    this.enabled = false;
    const now = this.ctx.currentTime;

    // Fade out drone
    if (this.droneGain) {
      this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
      this.droneGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
    }

    // Stop oscillators after fade
    const stopTime = now + 2.5;
    [this.droneOsc1, this.droneOsc2, this.droneLFO].forEach((osc) => {
      if (osc) {
        try { osc.stop(stopTime); } catch (e) {}
      }
    });

    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneLFO = null;
    this.droneGain = null;
    this.droneLFOCgain = null;

    if (this.chimeTimer) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }

    this.announce('Ambient soundscape disabled');
  }

  toggle() {

    if (this.enabled) {
      this.stopAmbient();
      return false;
    }
    this.startAmbient();
    return true;
  }

  // -----------------------------------------------------------------------
  // Random celestial chimes (background ambience)
  // -----------------------------------------------------------------------
  scheduleRandomChime() {
    if (!this.enabled) return;
    const delay = 4 + Math.random() * 8; // 4-12 seconds
    this.chimeTimer = setTimeout(() => {
      if (!this.enabled) return;
      this.playCelestialChime();
      this.scheduleRandomChime();
    }, delay * 1000);
  }

  playCelestialChime() {
    const now = this.ctx.currentTime;
    const base = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
    const freq = base[Math.floor(Math.random() * base.length)] * (0.5 + Math.random());
    const type = ['sine', 'triangle'][Math.floor(Math.random() * 2)];
    this.triggerChime(freq, type, 0.5, now, 1.4);
  }

  // -----------------------------------------------------------------------
  // Per-star harmonic chime
  // -----------------------------------------------------------------------
  /**
   * Play a star's unique harmonic chime.
   * @param {Object} audio - { freq: number, type: string }
   * @param {string} starId - star id (for dedup)
   */
  playStarChime(audio, starId = null) {
    if (!this.ctx) this.init();
    const now = this.ctx.currentTime;

    if (starId && starId === this.lastChimeStarId && now - this.lastChimeTime < 0.6) {
      return;
    }
    if (starId) {
      this.lastChimeStarId = starId;
      this.lastChimeTime = now;
    }

    const freq = audio && audio.freq ? Number(audio.freq) : 440;
    const type = audio && audio.type ? audio.type : 'sine';

    this.triggerChime(freq, type, 0.35, now, 1.2);
    this.triggerChime(freq * 2, type, 0.15, now + 0.05, 0.8);
    this.triggerChime(freq * 1.5, type, 0.12, now + 0.08, 0.7);
  }

  triggerChime(freq, type, gain, startTime, duration) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(env);
    env.connect(this.masterGain);

    osc.start(startTime);
    try { osc.stop(startTime + duration + 0.05); } catch (e) {}
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------
  announce(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1800);
    }
  }

  bindUnlock(targets = []) {
    const unlock = async () => {
      if (this.userGesture) return;
      try {
        await this.ensureContext();
        this.userGesture = true;
      } catch (e) {
        console.warn('[audio] unable to unlock context', e);
      }
      targets.forEach((t) => {
        t.removeEventListener('pointerdown', unlock);
        t.removeEventListener('keydown', unlock);
      });
    };

    const els = Array.isArray(targets) ? targets : [targets];
    els.forEach((t) => {
      if (!t) return;
      t.addEventListener('pointerdown', unlock, { once: false });
      t.addEventListener('keydown', unlock, { once: false });
    });
    document.addEventListener('pointerdown', unlock, { once: false });
    document.addEventListener('keydown', unlock, { once: false });
  }
}

// Singleton
const audioEngine = new CosmicAudioEngine();
export default audioEngine;
export { audioEngine };
