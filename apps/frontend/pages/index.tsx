import { useEffect, useRef, useState } from 'react';
import styles from '../styles/home.module.css';

interface RemotePeer {
  id: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  stats: { bitrate: number; fps: number } | null;
}

type PeerMap = Map<string, RTCPeerConnection>;

interface QualityPreset {
  name: string;
  width: number;
  height: number;
  fps30Bitrate: number;
  fps60Bitrate: number;
}

const QUALITY_PRESETS: { [key: string]: QualityPreset } = {
  '1080p': { name: '1080p', width: 1920, height: 1080, fps30Bitrate: 8_000_000, fps60Bitrate: 16_000_000 },
  '1440p': { name: '1440p', width: 2560, height: 1440, fps30Bitrate: 16_000_000, fps60Bitrate: 32_000_000 },
  '2160p': { name: '2160p (4K)', width: 3840, height: 2160, fps30Bitrate: 35_000_000, fps60Bitrate: 60_000_000 }
};

export default function Home() {
  const [room, setRoom] = useState('demo-room');
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [stats, setStats] = useState<{ bitrate: number; fps: number } | null>(null);
  const [peersConnected, setPeersConnected] = useState(0);
  
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcsRef = useRef<PeerMap>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string>(Math.random().toString(36).slice(2));
  const remotePeersRef = useRef<Map<string, RemotePeer>>(new Map());
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      pcsRef.current.forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    fetch('http://localhost:3001/config')
      .then((r) => r.json())
      .catch(() => console.log('Could not fetch config, using defaults'));
  }, []);

  function getTargetBitrate(q: string, fps_val: number) {
    const preset = QUALITY_PRESETS[q];
    if (!preset) return 8_000_000;
    return fps_val === 60 ? preset.fps60Bitrate : preset.fps30Bitrate;
  }

  function qualityConstraints(q: string, fps_val: number): MediaStreamConstraints {
    const preset = QUALITY_PRESETS[q];
    return {
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: fps_val }
      },
      audio: true
    };
  }

  async function setBitrate(pc: RTCPeerConnection, bitrate: number) {
    const senders = pc.getSenders();
    for (const sender of senders) {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = bitrate;
      try {
        await sender.setParameters(params);
      } catch (e) {
        console.warn('Could not set bitrate', e);
      }
    }
  }

  async function monitorStats(pc: RTCPeerConnection, peerId: string) {
    if (statsIntervalRef.current) return;
    
    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let bitrate = 0;
        let fps_val = 0;
        let lastBytesSent = 0;
        let lastTimestamp = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            const bytesSent = report.bytesSent || 0;
            const timestamp = report.timestamp || Date.now();
            if (lastBytesSent > 0) {
              const bitsSent = (bytesSent - lastBytesSent) * 8;
              const timeDiff = (timestamp - lastTimestamp) / 1000;
              if (timeDiff > 0) bitrate = Math.round(bitsSent / timeDiff);
            }
            fps_val = report.framesPerSecond || 0;
            lastBytesSent = bytesSent;
            lastTimestamp = timestamp;
          }
        });

        if (bitrate > 0) {
          setStats({ bitrate, fps: fps_val });
          const peer = remotePeersRef.current.get(peerId);
          if (peer) {
            peer.stats = { bitrate, fps: fps_val };
            setRemotePeers(Array.from(remotePeersRef.current.values()));
          }
        }

        const targetBitrate = getTargetBitrate(quality, fps);
        if (bitrate > targetBitrate * 1.5) {
          await setBitrate(pc, Math.floor(targetBitrate * 0.7));
        }
      } catch (e) {
        // stats not available yet
      }
    }, 1000);

    statsIntervalRef.current = interval;
  }

  async function startCapture() {
    const constraints = qualityConstraints(quality, fps);
    const stream = await (navigator.mediaDevices as any).getDisplayMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }

    pcsRef.current.forEach((pc, peerId) => {
      stream.getTracks().forEach((track: MediaStreamTrack) => {
        try {
          const senders = pc.getSenders();
          const sender = senders.find((s) => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track).catch(() => {});
          } else {
            pc.addTrack(track, stream);
          }
        } catch (e) {
          pc.addTrack(track, stream);
        }
      });
      const bitrate = getTargetBitrate(quality, fps);
      setBitrate(pc, bitrate);
      monitorStats(pc, peerId);
    });

    setSharing(true);
  }

  async function stopCapture() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setSharing(false);
    setStats(null);
  }

  function connect() {
    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:3001';
    const ws = new WebSocket(signalingUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room, id: clientIdRef.current }));
    };

    ws.onmessage = async (ev) => {
      const data = JSON.parse(ev.data);
      const { type } = data;

      if (type === 'peer-list') {
        const maxPeers = Math.min(data.peers.length, 14);
        for (let i = 0; i < maxPeers; i++) {
          const peerId = data.peers[i];
          if (!pcsRef.current.has(peerId)) {
            const pc = createPeerConnection(peerId, ws);
            pcsRef.current.set(peerId, pc);
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', to: peerId, room, sdp: offer.sdp }));
          }
        }
        setConnected(true);
        setPeersConnected(maxPeers);
      }

      if (type === 'peer-joined') {
        const peerId = data.peerId;
        const peerCount = pcsRef.current.size;
        
        if (peerCount < 14) {
          if (!pcsRef.current.has(peerId)) {
            const pc = createPeerConnection(peerId, ws);
            pcsRef.current.set(peerId, pc);
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', to: peerId, room, sdp: offer.sdp }));
            setPeersConnected(pcsRef.current.size);
          }
        }
      }

      if (type === 'peer-left') {
        const peerId = data.peerId;
        const pc = pcsRef.current.get(peerId);
        if (pc) pc.close();
        pcsRef.current.delete(peerId);
        
        const updated = remotePeers.filter((p) => p.id !== peerId);
        setRemotePeers(updated);
        remotePeersRef.current.delete(peerId);
        setPeersConnected(pcsRef.current.size);
      }

      if (type === 'offer' && data.from) {
        const from = data.from;
        let pc = pcsRef.current.get(from);
        if (!pc) {
          pc = createPeerConnection(from, ws);
          pcsRef.current.set(from, pc);
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', to: from, room, sdp: answer.sdp }));
      }

      if (type === 'answer' && data.from) {
        const from = data.from;
        const pc = pcsRef.current.get(from);
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      }

      if (type === 'ice-candidate' && data.from && data.candidate) {
        const from = data.from;
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn('Failed to add ICE candidate', e);
          }
        }
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = (err) => console.error('WebSocket error', err);
  }

  function createPeerConnection(peerId: string, ws: WebSocket) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          to: peerId,
          room,
          candidate: e.candidate
        }));
      }
    };

    pc.ontrack = (e) => {
      const videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.srcObject = e.streams[0];
      videoEl.style.width = '100%';
      videoEl.style.height = '100%';
      videoEl.style.objectFit = 'contain';
      videoEl.style.background = '#000';

      if (!remotePeersRef.current.has(peerId)) {
        const ref: React.RefObject<HTMLVideoElement> = { current: videoEl };
        const peer: RemotePeer = { id: peerId, videoRef: ref, stats: null };
        remotePeersRef.current.set(peerId, peer);
        setRemotePeers(Array.from(remotePeersRef.current.values()));
      }

      const container = document.getElementById(`remote-${peerId}`);
      if (container) {
        container.innerHTML = '';
        container.appendChild(videoEl);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        pcsRef.current.delete(peerId);
        const container = document.getElementById(`remote-${peerId}`);
        if (container) container.innerHTML = '';
        remotePeersRef.current.delete(peerId);
        setRemotePeers(Array.from(remotePeersRef.current.values()));
        setPeersConnected(pcsRef.current.size);
      }
    };

    return pc;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎥 Screen Share</h1>
        <p className={styles.subtitle}>Real-time streaming up to 15 participants</p>
      </div>

      {/* Connection Panel */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Connection</div>
        
        <div className={styles.controlGroup}>
          <div className={styles.inputGroup} style={{ flex: 1 }}>
            <label>Room ID:</label>
            <input 
              value={room} 
              onChange={(e) => setRoom(e.target.value)} 
              disabled={connected}
              placeholder="demo-room"
            />
          </div>
          <button 
            className={styles.buttonPrimary}
            onClick={connect} 
            disabled={connected}
          >
            {connected ? '✓ Connected' : 'Connect'}
          </button>
        </div>

        {connected && (
          <div className={styles.stats}>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>Status:</span>
              <span className={styles.statsValue}>🟢 Connected</span>
            </div>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>Peers:</span>
              <span className={styles.statsValue}>{peersConnected} / 14</span>
            </div>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>Room:</span>
              <span className={styles.statsValue} style={{ fontFamily: 'monospace' }}>{room}</span>
            </div>
          </div>
        )}
      </div>

      {/* Quality Settings Panel */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Stream Settings</div>
        
        <div className={styles.selectGroup}>
          <label className={styles.selectGroupLabel}>Quality</label>
          <select 
            value={quality} 
            onChange={(e) => setQuality(e.target.value)} 
            disabled={sharing}
            className={styles.select}
          >
            <option value="1080p">1080p (1920×1080)</option>
            <option value="1440p">1440p (2560×1440)</option>
            <option value="2160p">2160p 4K (3840×2160)</option>
          </select>

          <label className={styles.selectGroupLabel}>Frame Rate</label>
          <select 
            value={fps} 
            onChange={(e) => setFps(Number(e.target.value))} 
            disabled={sharing}
            className={styles.select}
          >
            <option value={30}>30 FPS (lower bandwidth)</option>
            <option value={60}>60 FPS (smooth, high bandwidth)</option>
          </select>
        </div>

        {/* Bitrate Info */}
        {sharing && stats && (
          <div className={styles.stats} style={{ marginTop: 12 }}>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>Target:</span>
              <span className={styles.statsValue}>
                {(getTargetBitrate(quality, fps) / 1_000_000).toFixed(0)} Mbps
              </span>
            </div>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>Current Bitrate:</span>
              <span className={styles.statsValue}>{(stats.bitrate / 1_000_000).toFixed(1)} Mbps</span>
            </div>
            <div className={styles.statsLine}>
              <span className={styles.statsLabel}>FPS:</span>
              <span className={styles.statsValue}>{stats.fps}</span>
            </div>
          </div>
        )}

        <div className={styles.controlGroup} style={{ marginTop: 12 }}>
          <button 
            className={sharing ? styles.buttonDanger : styles.buttonSuccess}
            onClick={sharing ? stopCapture : startCapture}
            disabled={!connected}
          >
            {sharing ? '⏹ Stop Streaming' : '▶ Start Streaming'}
          </button>
        </div>
      </div>

      {/* Local Stream */}
      <div className={styles.videoSection}>
        <div className={styles.videoTitle}>
          <span>My Screen</span>
          {sharing && <span className={styles.videoBadge}>LIVE</span>}
        </div>
        <div className={styles.videoContainer}>
          <div className={styles.videoLocal}>
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className={styles.video}
            />
            {sharing && <div className={styles.videoLabel}>Sharing: {quality} @ {fps}fps</div>}
          </div>
        </div>
      </div>

      {/* Remote Streams */}
      <div className={styles.videoSection}>
        <div className={styles.videoTitle}>
          <span>Participants ({remotePeers.length})</span>
        </div>
        
        {remotePeers.length === 0 ? (
          <div className={styles.emptyRemote}>
            👥 Waiting for other participants to join...
          </div>
        ) : (
          <div className={styles.remoteGrid}>
            {remotePeers.map((peer) => (
              <div key={peer.id} className={styles.remoteVideo}>
                <div id={`remote-${peer.id}`} style={{ width: '100%', height: '100%' }} />
                <div className={styles.peerInfo}>
                  <div className={styles.peerId}>Peer: {peer.id.slice(0, 8)}...</div>
                  {peer.stats && (
                    <div className={styles.peerStats}>
                      <span>📊 {(peer.stats.bitrate / 1_000_000).toFixed(1)} Mbps</span>
                      <span>⚡ {peer.stats.fps} FPS</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
