/**
// ---------------------------------------------------------------------------
// REST API Routes
// ---------------------------------------------------------------------------

// Get all stars
app.get('/api/stars', (req, res) => {
  try {
    const stars = storage.getAll();
    res.json({ success: true, count: stars.length, stars });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a single star
app.get('/api/stars/:id', (req, res) => {
  try {
    const star = storage.get(req.params.id);
    if (!star) {
      return res.status(404).json({ success: false, error: 'Star not found' });
    }
    res.json({ success: true, star });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new star
app.post('/api/stars', (req, res) => {
  try {
    const {
      x, y, creator, message, tag, timeCapsule,
      pixelData, glow, color, audio
    } = req.body;

    // Validation
    if (x == null || y == null) {
      return res.status(400).json({ success: false, error: 'Coordinates x and y are required' });
    }
    if (!creator || creator.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Creator name is required' });
    }
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    const validTags = ['Memory', 'Wish', 'Dream', 'Art'];
    if (!tag || !validTags.includes(tag)) {
      return res.status(400).json({ success: false, error: 'Invalid tag' });
    }

    const star = storage.create({
      x: Number(x),
      y: Number(y),
      creator: creator.trim(),
      message: message.trim(),
      tag,
      timeCapsule: timeCapsule || null,
      pixelData: pixelData || [[0]],
      glow: Number(glow) || 0.5,
      color: color || '#ffffff',
      audio: audio || { freq: 440, type: 'sine' },
    });

    // Broadcast to all connected socket clients
    io.emit('star:created', star);

    res.status(201).json({ success: true, star });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a star (e.g. edit message)
app.put('/api/stars/:id', (req, res) => {
  try {
    const updated = storage.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Star not found' });
    }
    io.emit('star:updated', updated);
    res.json({ success: true, star: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a star
app.delete('/api/stars/:id', (req, res) => {
  try {
    const deleted = storage.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Star not found' });
    }
    io.emit('star:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send / toggle stardust vote
app.post('/api/stars/:id/stardust', (req, res) => {
  try {
    const { voterId } = req.body;
    if (!voterId) {
      return res.status(400).json({ success: false, error: 'voterId is required' });
    }
    const result = storage.vote(req.params.id, voterId);
    io.emit('star:stardust', { starId: req.params.id, ...result, voterId });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed some demo stars if the sky is empty (nice first-time experience)
function seedDemoStars() {
  if (storage.getAll().length > 0) return;
  const demo = [
    {
      x: -400, y: -300, creator: 'Starlight Team', message: 'Welcome to the night sky. ✨',
      tag: 'Wish', timeCapsule: null, pixelData: [[1,1],[1,1]], glow: 0.8, color: '#ffd700',
      audio: { freq: 523.25, type: 'sine' },
    },
    {
      x: 200, y: 150, creator: 'Astrid', message: 'Make a wish upon a star...',
      tag: 'Dream', timeCapsule: null, pixelData: [[0,1,0],[1,1,1],[0,1,0]], glow: 0.6, color: '#00ffff',
      audio: { freq: 659.25, type: 'triangle' },
    },
    {
      x: -100, y: 400, creator: 'Nova', message: 'This is a time capsule for 2030.',
      tag: 'Memory', timeCapsule: '2030-01-01T00:00:00Z', pixelData: [[1,0,1],[0,1,0],[1,0,1]], glow: 0.9, color: '#ff69b4',
      audio: { freq: 349.23, type: 'square' },
    },
  ];
  demo.forEach((s) => storage.create(s));
  console.log(`[seed] ${demo.length} demo stars planted.`);
}
 * Starlight Sky - Backend Server
 * 
 * Express + Socket.io server powering the collaborative night sky canvas.
 * Supports real-time multiplayer star placement with optional Firebase/MongoDB
 * persistence and a local in-memory storage fallback.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const SOCKET_CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN || '*';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'starlight-sky',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    storage: storage.type || 'memory',
  });
});

// ---------------------------------------------------------------------------
// Storage Layer (In-Memory with Firebase/MongoDB hooks)
// ---------------------------------------------------------------------------
/**
 * Star record schema:
 * {
 *   id: string,
 *   x: number,           // canvas world coordinate X
 *   y: number,           // canvas world coordinate Y
 *   creator: string,
 *   message: string,
 *   tag: 'Memory' | 'Wish' | 'Dream' | 'Art',
 *   timeCapsule: string | null,  // ISO date string or null
 *   pixelData: number[][],       // grid of RGBA values [row][col]
 *   glow: number,           // 0-1 glow intensity
 *   color: string,          // hex color
 *   audio: { freq: number, type: string }, // chime parameters
 *   stardust: number,       // upvote count
 *   createdAt: string       // ISO timestamp
 * }
 */
const storage = {
  type: 'memory',
  stars: new Map(),
  stardustVotes: new Map(), // starId -> Set of voter IDs

  // ----- Memory operations -----
  getAll() {
    return Array.from(this.stars.values());
  },

  get(id) {
    return this.stars.get(id);
  },

  create(star) {
    const id = star.id || nanoid(8);
    const record = {
      id,
      ...star,
      createdAt: star.createdAt || new Date().toISOString(),
      stardust: 0,
    };
    this.stars.set(id, record);
    return record;
  },

  update(id, patch) {
    const existing = this.stars.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.stars.set(id, updated);
    return updated;
  },

  delete(id) {
    return this.stars.delete(id);
  },

  // ----- Stardust (upvote) operations -----
  vote(starId, voterId) {
    if (!this.stardustVotes.has(starId)) {
      this.stardustVotes.set(starId, new Set());
    }
    const voters = this.stardustVotes.get(starId);
    if (voters.has(voterId)) {
      voters.delete(voterId); // toggle off
    } else {
      voters.add(voterId);
    }
    const star = this.stars.get(starId);
    if (star) {
      star.stardust = voters.size;
    }
    return { stardust: star ? star.stardust : 0, voted: voters.has(voterId) };
  },

  getVote(starId, voterId) {
    const voters = this.stardustVotes.get(starId);
    return voters ? voters.has(voterId) : false;
  },
};


// ---------------------------------------------------------------------------
// Socket.io - Real-time Multiplayer
// ---------------------------------------------------------------------------
const io = new Server(server, {
  cors: { origin: SOCKET_CORS_ORIGIN, methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);

  // Send current sky state to newly connected client
  socket.emit('sky:init', { stars: storage.getAll() });

  // Handle new star placement from client
  socket.on('star:place', (data, callback) => {
    try {
      const star = storage.create({
        ...data,
        id: data.id || nanoid(8),
        createdAt: new Date().toISOString(),
        stardust: 0,
      });
      // Broadcast to everyone except sender (sender already has it via REST optimistic UI)
      socket.broadcast.emit('star:created', star);
      if (callback) callback({ success: true, star });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Handle stardust vote via socket
  socket.on('star:stardust', (data) => {
    const { starId, voterId } = data;
    if (!starId || !voterId) return;
    const result = storage.vote(starId, voterId);
    io.emit('star:stardust', { starId, ...result, voterId });
  });

  // Handle star update
  socket.on('star:update', (data) => {
    const { id, ...patch } = data;
    const updated = storage.update(id, patch);
    if (updated) {
      socket.broadcast.emit('star:updated', updated);
    }
  });

  // Handle star delete
  socket.on('star:delete', (data) => {
    const { id } = data;
    if (storage.delete(id)) {
      socket.broadcast.emit('star:deleted', { id });
    }
  });

  // Typing / presence (lightweight social signal)
  socket.on('presence:join', (handle) => {
    socket.broadcast.emit('presence:joined', { handle, socketId: socket.id, at: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
    socket.broadcast.emit('presence:left', { socketId: socket.id, at: new Date().toISOString() });
  });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  seedDemoStars();
  console.log(`[server] Starlight Sky listening on http://localhost:${PORT}`);
  console.log(`[server] Environment: ${NODE_ENV}`);
  console.log(`[server] Storage: ${storage.type}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
});

module.exports = { app, server, io, storage };