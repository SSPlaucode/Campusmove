import React, { useState, useEffect, useCallback } from 'react';
import MapView from './MapView';

export default function DriverApp({ state, backend, onRefetch, lastUpdate, offline, driverToken, driverName, driverId, onLogin, onLogout }) {
  if (!driverToken) {
    return <DriverLogin backend={backend} onLogin={onLogin} />;
  }
  return <DriverDashboard
    state={state} backend={backend} onRefetch={onRefetch}
    lastUpdate={lastUpdate} offline={offline}
    driverToken={driverToken} driverName={driverName} driverId={driverId}
    onLogout={onLogout}
  />;
}

function DriverLogin({ backend, onLogin }) {
  const [drivers,  setDrivers]  = useState([]);
  const [driverId, setDriverId] = useState('');
  const [pin,      setPin]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch(`${backend}/api/drivers`)
      .then(r => r.json())
      .then(setDrivers)
      .catch(() => setError('Could not load driver list'));
  }, [backend]);

  const handleLogin = async () => {
    if (!driverId || !pin) { setError('Select your name and enter PIN'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${backend}/api/driver/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: parseInt(driverId), pin }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Login failed');
      else onLogin(data.token, data.name, data.driver_id);
    } catch { setError('Could not connect to server'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', marginBottom: 14 }}>
            <svg width="64" height="64" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="72" height="72" rx="18" fill="#0a0a0f"/>
              <rect x="1" y="1" width="70" height="70" rx="17" stroke="#f5a623" strokeWidth="1.5"/>
              <text x="36" y="50" textAnchor="middle" fontFamily="system-ui,sans-serif" fontSize="28" fontWeight="800" fill="#f5a623">CM</text>
              <rect x="6" y="58" width="14" height="2.5" rx="1.25" fill="#f5a623" opacity="0.7"/>
              <rect x="6" y="63" width="10" height="2" rx="1" fill="#f5a623" opacity="0.4"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--text)', marginBottom: 6 }}>Driver Portal</h1>
          <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>CampusMove · SAU</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '28px 24px' }}>
          <Label>SELECT YOUR NAME</Label>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
            <option value="">Choose driver...</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.driver_name} ⚡</option>)}
          </select>
          <Label>PIN</Label>
          <input type="password" inputMode="numeric" maxLength={8}
            value={pin} onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Enter your PIN"
            style={{ ...inputStyle, marginBottom: 20, letterSpacing: '0.2em' }} />
          {error && <div style={errBox}>{error}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: loading ? 'var(--surface2)' : 'var(--amber)',
              color: loading ? 'var(--text-faint)' : '#0a0a0f',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(245,166,35,0.35)' }}>
            {loading ? 'Logging in…' : '→  Driver Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

function isOperatingHour() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset - (now.getTimezoneOffset() * 60000));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return (mins >= 8*60+30 && mins < 10*60+30) || (mins >= 15*60+30 && mins < 18*60);
}

function nextShiftLabel() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset - (now.getTimezoneOffset() * 60000));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  if (mins < 8*60+30)  return '8:30 AM';
  if (mins < 15*60+30) return '3:30 PM';
  return '8:30 AM tomorrow';
}

function DriverDashboard({ state, backend, onRefetch, lastUpdate, offline, driverToken, driverName, driverId, onLogout }) {
  const [group,      setGroup]      = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [actionLoad, setActionLoad] = useState(false);
  const [error,      setError]      = useState('');

  const authHeader = { 'Authorization': `Bearer ${driverToken}` };

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${backend}/api/driver/dashboard`, { headers: authHeader });
      if (res.status === 401 || res.status === 403) { onLogout(); return; }
      const data = await res.json();
      setDriverInfo(data.driver);
      setGroup(data.group?.length ? data.group : null);
    } catch { /* offline */ }
  }, [backend, driverToken]);

  useEffect(() => {
    fetchDashboard();
    const t = setInterval(fetchDashboard, 15000);
    return () => clearInterval(t);
  }, [fetchDashboard]);

  useEffect(() => {
    if (!state || !driverId) return;
    fetchDashboard();
  }, [state, driverId]);

  // Stream live GPS when on an active trip
  useEffect(() => {
    if (!group || !navigator.geolocation) return;
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(pos => {
        fetch(`${backend}/api/driver/location`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      }, () => {}, { enableHighAccuracy: true, timeout: 5000 });
    }, 10000);
    return () => clearInterval(interval);
  }, [group, backend, driverToken]);

  const handleStart = async () => {
    if (!group?.length) return;
    const groupId = group[0].group_id;
    setActionLoad(true); setError('');
    try {
      const res = await fetch(`${backend}/api/driver/trip/start`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not start trip');
      else { await fetchDashboard(); onRefetch(); }
    } catch { setError('Connection error'); }
    setActionLoad(false);
  };

  const handleComplete = async () => {
    if (!group?.length) return;
    if (!window.confirm('Mark trip as complete? All passengers will be signed off.')) return;
    const groupId = group[0].group_id;
    setActionLoad(true); setError('');
    try {
      const res = await fetch(`${backend}/api/driver/trip/complete`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not complete trip');
      else { setGroup(null); onRefetch(); }
    } catch { setError('Connection error'); }
    setActionLoad(false);
  };

  const tripStatus = group?.[0]?.status;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>Driver Panel</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>🛺 {driverName} <span style={{ color: 'var(--green)' }}>⚡ EV</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%',
            background: driverInfo?.status === 'on_trip' ? 'var(--amber)' : driverInfo?.status === 'available' ? 'var(--green)' : 'var(--red)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {driverInfo?.status === 'on_trip' ? 'On Trip' : driverInfo?.status === 'available' ? 'Available' : 'Offline'}
          </span>
          <button onClick={onLogout} style={btnSmall}>Sign Out</button>
        </div>
      </div>

      {lastUpdate && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>
          {offline ? '⚠️ Offline · ' : 'Live · '}{lastUpdate.toLocaleTimeString()}
        </div>
      )}

      {error && <div style={{ ...errBox, marginBottom: 16 }}>{error}</div>}

      {driverInfo?.status === 'offline' && !group ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌙</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>Off Duty</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 20 }}>
            Your vehicle is outside operating hours.<br />
            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Shifts: 8:30–10:30 AM · 3:30–6:00 PM</span>
          </div>
          <div style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 20,
            background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.3)',
            fontSize: 13, color: 'var(--amber)', marginBottom: 20 }}>
            ⏰ Next shift starts at <strong>{nextShiftLabel()}</strong>
          </div>
          <div>
            <button onClick={fetchDashboard} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              🔄  Refresh
            </button>
          </div>
        </div>

      ) : !group ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>Waiting for assignment</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>You'll be notified here when a group of students is dispatched to you.</div>
          <button onClick={fetchDashboard} style={{ marginTop: 24, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            🔄  Refresh
          </button>
        </div>

      ) : (
        <>
          <div style={{ animation: 'float-up 0.5s ease both', marginBottom: 20 }}>
            <div style={{
              background: tripStatus === 'started' ? 'var(--green-dim)' : 'var(--amber-dim)',
              border: `1px solid ${tripStatus === 'started' ? 'rgba(0,229,160,0.4)' : 'rgba(245,166,35,0.4)'}`,
              borderRadius: 24, padding: '24px 20px'
            }}>
              <SectionLabel>{tripStatus === 'started' ? 'TRIP IN PROGRESS' : 'PASSENGERS ASSIGNED'}</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 20 }}>📍</span>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Route</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{group[0].pickup} → {group[0].dropoff}</div>
                </div>
              </div>
              <SectionLabel>PASSENGERS ({group.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {group.map((entry, i) => (
                  <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', flexShrink: 0 }}>{i+1}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{entry.student_name}</div></div>
                    <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8,
                      background: entry.status === 'started' ? 'var(--green-dim)' : 'var(--amber-dim)',
                      color: entry.status === 'started' ? 'var(--green)' : 'var(--amber)',
                      border: `1px solid ${entry.status === 'started' ? 'rgba(0,229,160,0.3)' : 'rgba(245,166,35,0.3)'}` }}>
                      {entry.status === 'started' ? 'On board' : 'Waiting'}
                    </div>
                  </div>
                ))}
              </div>
              {tripStatus === 'dispatched' && (
                <button onClick={handleStart} disabled={actionLoad}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                    background: actionLoad ? 'var(--surface2)' : 'var(--green)',
                    color: actionLoad ? 'var(--text-faint)' : '#0a0a0f',
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                    cursor: actionLoad ? 'not-allowed' : 'pointer',
                    boxShadow: actionLoad ? 'none' : '0 4px 20px rgba(0,229,160,0.3)' }}>
                  {actionLoad ? 'Starting…' : '✓  All Aboard — Start Trip'}
                </button>
              )}
              {tripStatus === 'started' && (
                <button onClick={handleComplete} disabled={actionLoad}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px solid var(--green)',
                    background: actionLoad ? 'var(--surface2)' : '#0a0a0f',
                    color: actionLoad ? 'var(--text-faint)' : 'var(--green)',
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                    cursor: actionLoad ? 'not-allowed' : 'pointer',
                    boxShadow: actionLoad ? 'none' : '0 4px 20px rgba(0,229,160,0.2)' }}>
                  {actionLoad ? 'Completing…' : '🏁  Trip Complete — Drop Off Done'}
                </button>
              )}
            </div>
          </div>
          {state?.autos && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>LIVE MAP</SectionLabel>
              <MapView autos={state.autos} highlightId={parseInt(driverId)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const selectStyle = {
  width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)',
  outline: 'none', cursor: 'pointer', appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='rgba(240,240,248,0.3)' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
};
const inputStyle = {
  width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font-body)',
  outline: 'none', boxSizing: 'border-box',
};
const errBox = {
  padding: '10px 14px', borderRadius: 10, marginBottom: 14,
  background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)',
  fontSize: 13, color: 'var(--red)',
};
const btnSmall = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text-faint)', fontSize: 12,
  fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
};
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-faint)', marginBottom: 12 }}>{children}</div>;
}
function Label({ children }) {
  return <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>{children}</label>;
}
