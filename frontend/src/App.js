import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import StudentApp from './components/StudentApp';
import AdminApp from './components/AdminApp';
import { io } from 'socket.io-client';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

// ── Offline cache helpers ─────────────────────────────────────────────────────
const CACHE_KEY = 'campusmove_state_cache';
function saveCache(state) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ state, ts: Date.now() })); } catch {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function App() {
  const [view, setView] = useState('student');
  const [state, setState] = useState(() => loadCache()?.state || null);
  const [connected, setConnected] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('cm_admin_token') || null);
  const socketRef = useRef(null);

  useEffect(() => {
    // ── Socket.IO connection ──────────────────────────────────────────────────
    const socket = io(BACKEND, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setOffline(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setOffline(true);
    });

    socket.on('init', ({ data }) => {
      setState(data);
      saveCache(data);
      setLastUpdate(new Date());
      setOffline(false);
    });

    socket.on('state_update', ({ data }) => {
      setState(data);
      saveCache(data);
      setLastUpdate(new Date());
    });

    // Fallback poll if socket drops
    const poll = setInterval(async () => {
      if (socket.connected) return;
      try {
        const res = await fetch(`${BACKEND}/api/state`);
        const data = await res.json();
        setState(data);
        saveCache(data);
        setLastUpdate(new Date());
        setOffline(false);
      } catch {
        setOffline(true);
      }
    }, 6000);

    return () => {
      socket.disconnect();
      clearInterval(poll);
    };
  }, []);

  const refetch = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/state`);
      const data = await res.json();
      setState(data);
      saveCache(data);
      setLastUpdate(new Date());
    } catch {}
  };

  const handleLogin = (token) => {
    setAdminToken(token);
    sessionStorage.setItem('cm_admin_token', token);
  };

  const handleLogout = () => {
    setAdminToken(null);
    sessionStorage.removeItem('cm_admin_token');
    setView('student');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Offline banner */}
      {offline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
          background: 'rgba(255,77,109,0.95)', padding: '8px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, fontWeight: 500, color: '#fff',
          backdropFilter: 'blur(10px)',
        }}>
          <span>⚠️</span>
          Offline — showing last known data
          {loadCache()?.ts && (
            <span style={{ opacity: 0.7, fontSize: 11 }}>
              (as of {new Date(loadCache().ts).toLocaleTimeString()})
            </span>
          )}
        </div>
      )}

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)',
        position: 'sticky', top: offline ? 37 : 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🚌</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px', color: 'var(--text)' }}>
            Campus<span style={{ color: 'var(--amber)' }}>Move</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 20,
            background: connected ? 'var(--green-dim)' : 'var(--red-dim)',
            border: `1px solid ${connected ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,109,0.3)'}`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--red)', animation: connected ? 'blink 2s infinite' : 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: connected ? 'var(--green)' : 'var(--red)' }}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <div style={{ display: 'flex', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {['student', 'admin'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-display)', letterSpacing: '0.5px',
                textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                background: view === v ? 'var(--amber)' : 'transparent',
                color: view === v ? '#0a0a0f' : 'var(--text-dim)', transition: 'all 0.2s',
              }}>{v}</button>
            ))}
          </div>
          {adminToken && (
            <button onClick={handleLogout} style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              fontFamily: 'var(--font-display)', cursor: 'pointer',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'transparent', color: 'var(--text-faint)',
            }}>Logout</button>
          )}
        </div>
      </nav>

      {view === 'student'
        ? <StudentApp state={state} backend={BACKEND} onRefetch={refetch} lastUpdate={lastUpdate} offline={offline} />
        : <AdminApp state={state} backend={BACKEND} onRefetch={refetch} adminToken={adminToken} onLogin={handleLogin} />
      }
    </div>
  );
}
