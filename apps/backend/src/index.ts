import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

interface Peer {
  id: string;
  ws: WebSocket;
}

interface Room {
  peers: Map<string, Peer>;
}

type RoomMap = Map<string, Room>;
const rooms: RoomMap = new Map();

// TURN config with multiple servers
const TURN_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

const MAX_PEERS_PER_ROOM = 15;

function getPeerListForRoom(roomId: string, exceptId?: string): string[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const list: string[] = [];
  for (const [id] of room.peers) {
    if (id !== exceptId) list.push(id);
  }
  return list;
}

function sendToPeer(roomId: string, peerId: string, data: any): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  const peer = room.peers.get(peerId);
  if (!peer || peer.ws.readyState !== WebSocket.OPEN) return false;
  try {
    peer.ws.send(JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn(`Failed to send to ${peerId}:`, e);
    return false;
  }
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let peerId: string | null = null;
  let joinedRoom: string | null = null;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(String(msg));
      const { type } = data;

      if (type === 'join') {
        const { room, id } = data;
        peerId = id;
        joinedRoom = room;
        
        if (!rooms.has(room)) {
          rooms.set(room, { peers: new Map() });
        }
        
        const roomObj = rooms.get(room)!;
        
        // Only allow up to MAX_PEERS_PER_ROOM
        if (roomObj.peers.size >= MAX_PEERS_PER_ROOM) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }
        
        roomObj.peers.set(id, { id, ws });
        
        // Send current peer list
        const peerList = getPeerListForRoom(room, id);
        ws.send(JSON.stringify({ type: 'peer-list', peers: peerList }));
        
        // Notify other peers
        for (const [otherId, otherPeer] of roomObj.peers) {
          if (otherId !== id && otherPeer.ws.readyState === WebSocket.OPEN) {
            otherPeer.ws.send(JSON.stringify({ type: 'peer-joined', peerId: id }));
          }
        }
        
        console.log(`[${room}] Peer ${id.slice(0, 8)} joined. Total: ${roomObj.peers.size}/${MAX_PEERS_PER_ROOM}`);
        return;
      }

      if (type === 'leave') {
        if (!joinedRoom || !peerId) return;
        const room = rooms.get(joinedRoom);
        if (room) {
          room.peers.delete(peerId);
          for (const [, otherPeer] of room.peers) {
            if (otherPeer.ws.readyState === WebSocket.OPEN) {
              otherPeer.ws.send(JSON.stringify({ type: 'peer-left', peerId }));
            }
          }
          console.log(`[${joinedRoom}] Peer ${peerId.slice(0, 8)} left. Total: ${room.peers.size}/${MAX_PEERS_PER_ROOM}`);
        }
        joinedRoom = null;
        peerId = null;
        return;
      }

      // Forward signaling messages
      if ((type === 'offer' || type === 'answer' || type === 'ice-candidate') && data.to) {
        if (joinedRoom && peerId) {
          const success = sendToPeer(joinedRoom, data.to, { ...data, from: peerId });
          if (!success && type === 'ice-candidate') {
            console.warn(`Failed to forward ICE candidate to ${data.to.slice(0, 8)}`);
          }
        }
        return;
      }
    } catch (e) {
      console.error('invalid message', e);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (!joinedRoom || !peerId) return;
    const room = rooms.get(joinedRoom);
    if (room) {
      room.peers.delete(peerId);
      for (const [, otherPeer] of room.peers) {
        if (otherPeer.ws.readyState === WebSocket.OPEN) {
          otherPeer.ws.send(JSON.stringify({ type: 'peer-left', peerId }));
        }
      }
      console.log(`[${joinedRoom}] Peer ${peerId.slice(0, 8)} disconnected. Total: ${room.peers.size}/${MAX_PEERS_PER_ROOM}`);
      
      if (room.peers.size === 0) {
        rooms.delete(joinedRoom);
        console.log(`[${joinedRoom}] Room deleted (empty)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.warn(`WebSocket error for ${peerId?.slice(0, 8)}:`, err.message);
  });
});

app.get('/config', (req, res) => {
  const signalingUrl = process.env.SIGNALING_URL || 'ws://localhost:3001';
  res.json({
    signalingUrl,
    iceServers: TURN_CONFIG.iceServers,
    maxPeersPerRoom: MAX_PEERS_PER_ROOM
  });
});

const PORT = process.env.PORT || 3001;

// Keep-alive function to prevent server from sleeping on Render.com
function keepAlive() {
  const healthUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    try {
      fetch(`${healthUrl}/health`).catch(() => {});
    } catch (e) {
      // Silently fail - it's just a keep-alive ping
    }
  }, 5 * 60 * 1000); // Ping every 5 minutes
}

server.listen(PORT, () => {
  console.log(`🚀 Signaling server listening on port ${PORT}`);
  console.log(`📊 Max peers per room: ${MAX_PEERS_PER_ROOM}`);
  console.log(`🌐 TURN servers configured: ${TURN_CONFIG.iceServers.length}`);
  
  // Start keep-alive if on Render.com
  if (process.env.RENDER === 'true') {
    console.log(`⏰ Keep-alive enabled (Render.com)`);
    keepAlive();
  }
});
