import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AuthScreen  from './AuthScreen';
import StudentApp  from './StudentApp';
import AdminApp    from './AdminApp';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ── Role detection ────────────────────────────────────────────────────────────
// Decode JWT payload WITHOUT verifying signature (verification happens server-side).
function decodeJWT(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [studentToken, setStudentToken] = useState(() => {
    const t = localStorage.getItem('cm_student_token');
    return t && decodeJWT(t) ? t : null;
  });
  const [studentName,  setStudentName]  = useState(() => localStorage.getItem('cm_student_name')  || '');
  const [studentEmail, setStudentEmail] = useState(() => localStorage.getItem('cm_student_email') || '');

  const [adminToken, setAdminToken] = useState(null);

  // Which view is the user in: 'student' | 'admin_login' | 'admin'
  // Students land on 'student' automatically after auth.
  // Admins must go to /admin (or tap a hidden link) to get the admin login screen.
  const [view, setView] = useState(() => {
    // If URL has #admin, show admin login
    if (window.location.hash === '#admin') return 'admin_login';
    return studentToken ? 'student' : 'auth';
  });

  // ── App data ────────────────────────────────────────────────────────────────
  const [state, setState] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [offline, setOffline] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchState();
    const socket = io(BACKEND);
    socketRef.current = socket;
    socket.on('init',         ({ data }) => { setState(data); setLastUpdate(new Date()); setOffline(false); });
    socket.on('state_update', ({ data }) => { setState(data); setLastUpdate(new Date()); setOffline(false); });
    socket.on('disconnect', () => setOffline(true));
    return () => socket.disconnect();
  }, []);

  async function fetchState() {
    try {
      const res = await fetch(`${BACKEND}/api/state`);
      if (res.ok) { setState(await res.json()); setLastUpdate(new Date()); setOffline(false); }
    } catch { setOffline(true); }
  }

  // ── Auth handlers ───────────────────────────────────────────────────────────
  function handleStudentAuth(token, name, email) {
    setStudentToken(token);
    setStudentName(name);
    setStudentEmail(email);
    setView('student');
  }

  function handleStudentLogout() {
    localStorage.removeItem('cm_student_token');
    localStorage.removeItem('cm_student_name');
    localStorage.removeItem('cm_student_email');
    setStudentToken(null);
    setStudentName('');
    setStudentEmail('');
    setView('auth');
  }

  function handleAdminLogin(token) {
    setAdminToken(token);
    setView('admin');
  }

  function handleAdminLogout() {
    setAdminToken(null);
    setView('admin_login');
    // Clear hash so a page refresh doesn't bounce back to admin
    window.location.hash = '#admin';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Student auth screen
  if (view === 'auth') {
    return (
      <AppShell>
        <AuthScreen backend={BACKEND} onAuth={handleStudentAuth} />
        {/* Hidden admin entry — plain text link, no obvious button */}
        <div style={{ position: 'fixed', bottom: 12, right: 16 }}>
          <span
            onClick={() => setView('admin_login')}
            style={{ fontSize: 10, color: 'var(--text-faint)', cursor: 'pointer', opacity: 0.4, userSelect: 'none' }}
          >
            admin
          </span>
        </div>
      </AppShell>
    );
  }

  // Student app — only rendered when student is logged in
  if (view === 'student') {
    return (
      <AppShell>
        <StudentApp
          state={state}
          backend={BACKEND}
          onRefetch={fetchState}
          lastUpdate={lastUpdate}
          offline={offline}
          studentToken={studentToken}
          studentName={studentName}
          onLogout={handleStudentLogout}
        />
      </AppShell>
    );
  }

  // Admin login screen — completely separate, no student UI
  if (view === 'admin_login') {
    return (
      <AppShell>
        <AdminApp
          state={state}
          backend={BACKEND}
          onRefetch={fetchState}
          adminToken={null}
          onLogin={handleAdminLogin}
          onLogout={handleAdminLogout}
        />
      </AppShell>
    );
  }

  // Admin dashboard — only rendered when admin is logged in
  if (view === 'admin') {
    return (
      <AppShell>
        <AdminApp
          state={state}
          backend={BACKEND}
          onRefetch={fetchState}
          adminToken={adminToken}
          onLogin={handleAdminLogin}
          onLogout={handleAdminLogout}
        />
      </AppShell>
    );
  }

  return null;
}

// Minimal wrapper — keeps global styles in one place
function AppShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {children}
    </div>
  );
}
