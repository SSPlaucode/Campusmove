import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AuthScreen  from './AuthScreen';
import StudentApp  from './components/StudentApp';
import AdminApp    from './components/AdminApp';
import DriverApp   from './components/DriverApp';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function decodeJWT(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [studentToken, setStudentToken] = useState(() => {
    const t = localStorage.getItem('cm_student_token');
    return t && decodeJWT(t) ? t : null;
  });
  const [studentName,  setStudentName]  = useState(() => localStorage.getItem('cm_student_name')  || '');
  const [studentEmail, setStudentEmail] = useState(() => localStorage.getItem('cm_student_email') || '');

  const [adminToken,  setAdminToken]  = useState(null);

  const [driverToken,  setDriverToken]  = useState(() => {
    const t = localStorage.getItem('cm_driver_token');
    return t && decodeJWT(t) ? t : null;
  });
  const [driverName,   setDriverName]   = useState(() => localStorage.getItem('cm_driver_name')  || '');
  const [driverId,     setDriverId]     = useState(() => localStorage.getItem('cm_driver_id')    || null);

  // ── View routing ────────────────────────────────────────────────────────────
  const [view, setView] = useState(() => {
    const hash = window.location.hash;
    if (hash === '#admin')  return 'admin_login';
    if (hash === '#driver') {
      const t = localStorage.getItem('cm_driver_token');
      return t && decodeJWT(t) ? 'driver' : 'driver_login';
    }
    return studentToken ? 'student' : 'auth';
  });

  // ── App data ────────────────────────────────────────────────────────────────
  const [state,      setState]      = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [offline,    setOffline]    = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchState();
    const socket = io(BACKEND);
    socketRef.current = socket;
    socket.on('init',         ({ data }) => { setState(data); setLastUpdate(new Date()); setOffline(false); });
    socket.on('state_update', ({ data }) => { setState(data); setLastUpdate(new Date()); setOffline(false); });
    socket.on('disconnect',   ()         => setOffline(true));
    return () => socket.disconnect();
  }, []);

  async function fetchState() {
    try {
      const res = await fetch(`${BACKEND}/api/state`);
      if (res.ok) { setState(await res.json()); setLastUpdate(new Date()); setOffline(false); }
    } catch { setOffline(true); }
  }

  // ── Student auth ────────────────────────────────────────────────────────────
  function handleStudentAuth(token, name, email) {
    localStorage.setItem('cm_student_token', token);
    localStorage.setItem('cm_student_name',  name);
    localStorage.setItem('cm_student_email', email);
    setStudentToken(token); setStudentName(name); setStudentEmail(email);
    setView('student');
  }

  function handleStudentLogout() {
    localStorage.removeItem('cm_student_token');
    localStorage.removeItem('cm_student_name');
    localStorage.removeItem('cm_student_email');
    setStudentToken(null); setStudentName(''); setStudentEmail('');
    setView('auth');
  }

  // ── Admin auth ──────────────────────────────────────────────────────────────
  function handleAdminLogin(token) { setAdminToken(token); setView('admin'); }
  function handleAdminLogout() { setAdminToken(null); setView('admin_login'); window.location.hash = '#admin'; }

  // ── Driver auth ─────────────────────────────────────────────────────────────
  function handleDriverLogin(token, name, id) {
    localStorage.setItem('cm_driver_token', token);
    localStorage.setItem('cm_driver_name',  name);
    localStorage.setItem('cm_driver_id',    id);
    setDriverToken(token); setDriverName(name); setDriverId(id);
    setView('driver');
  }

  function handleDriverLogout() {
    localStorage.removeItem('cm_driver_token');
    localStorage.removeItem('cm_driver_name');
    localStorage.removeItem('cm_driver_id');
    setDriverToken(null); setDriverName(''); setDriverId(null);
    setView('driver_login');
    window.location.hash = '#driver';
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (view === 'auth') {
    return (
      <AppShell>
        <AuthScreen backend={BACKEND} onAuth={handleStudentAuth} />
        <div style={{ position: 'fixed', bottom: 12, right: 16, display: 'flex', gap: 16 }}>
          <span onClick={() => setView('admin_login')}
            style={{ fontSize: 10, color: 'var(--text-faint)', cursor: 'pointer', opacity: 0.4, userSelect: 'none' }}>
            admin
          </span>
          <span onClick={() => setView('driver_login')}
            style={{ fontSize: 10, color: 'var(--text-faint)', cursor: 'pointer', opacity: 0.4, userSelect: 'none' }}>
            driver
          </span>
        </div>
      </AppShell>
    );
  }

  if (view === 'student') {
    return (
      <AppShell>
        <StudentApp
          state={state} backend={BACKEND} onRefetch={fetchState}
          lastUpdate={lastUpdate} offline={offline}
          studentToken={studentToken} studentName={studentName} studentEmail={studentEmail}
          onLogout={handleStudentLogout}
        />
      </AppShell>
    );
  }

  if (view === 'admin_login' || view === 'admin') {
    return (
      <AppShell>
        <AdminApp
          state={state} backend={BACKEND} onRefetch={fetchState}
          adminToken={view === 'admin' ? adminToken : null}
          onLogin={handleAdminLogin} onLogout={handleAdminLogout}
        />
      </AppShell>
    );
  }

  if (view === 'driver_login' || view === 'driver') {
    return (
      <AppShell>
        <DriverApp
          state={state} backend={BACKEND} onRefetch={fetchState}
          lastUpdate={lastUpdate} offline={offline}
          driverToken={view === 'driver' ? driverToken : null}
          driverName={driverName} driverId={driverId}
          onLogin={handleDriverLogin} onLogout={handleDriverLogout}
        />
      </AppShell>
    );
  }

  return null;
}

function AppShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {children}
    </div>
  );
}
