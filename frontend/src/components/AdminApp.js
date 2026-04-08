import React, { useState } from 'react';

export default function AdminApp({ state, backend, onRefetch, adminToken, onLogin }) {
  const [updating, setUpdating] = useState(false);
  const [eta, setEta] = useState('');
  const [peak, setPeak] = useState('');
  const [msg, setMsg] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // ── Login helpers defined BEFORE early return ─────────────────────────────
  async function handleLogin() {
    if (!password.trim()) return;
    setLoggingIn(true); setLoginError('');
    try {
      const res = await fetch(`${backend}/api/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) setLoginError(data.error || 'Login failed');
      else onLogin(data.token);
    } catch { setLoginError('Could not connect to server'); }
    setLoggingIn(false);
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!adminToken) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', padding: '0 20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '36px 28px', animation: 'float-up 0.5s ease both' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔐</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 6 }}>Admin Access</h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Enter the admin password to continue</p>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>PASSWORD</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter password..."
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          {loginError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', fontSize: 13, color: 'var(--red)' }}>
              {loginError}
            </div>
          )}
          <button onClick={handleLogin} disabled={loggingIn} style={{ ...btnStyle('var(--amber)'), width: '100%', padding: '14px' }}>
            {loggingIn ? 'Verifying...' : 'Login →'}
          </button>
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
            Default password: <code style={{ color: 'var(--amber)' }}>bytes2026</code>
          </div>
        </div>
      </div>
    );
  }

  // ── Auth helpers ──────────────────────────────────────────────────────────
  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
  }

  // ── Admin actions ─────────────────────────────────────────────────────────
  const updateState = async (payload) => {
    setUpdating(true); setMsg('');
    try {
      const res = await fetch(`${backend}/api/admin/update`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { setMsg('Error — token expired? Please re-login.'); return; }
      onRefetch();
      setMsg('Updated ✓');
      setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('Connection error'); }
    setUpdating(false);
  };

  const toggleAuto = async (auto) => {
    try {
      const newStatus = auto.status === 'available' ? 'on_trip' : 'available';
      await fetch(`${backend}/api/admin/auto/${auto.id}`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ status: newStatus, location: newStatus === 'available' ? 'gate' : 'campus' }),
      });
      onRefetch();
    } catch { setMsg('Toggle failed'); }
  };

  const completeTrip = async (tripId) => {
    try {
      await fetch(`${backend}/api/trip/${tripId}/complete`, { method: 'POST', headers: authHeaders() });
      onRefetch();
    } catch { setMsg('Complete trip failed'); }
  };

  const autosAtGate = state ? parseInt(state.autos_at_gate || 0) : 0;
  const forecast = state?.forecast;
  const activeTrips = state?.trips?.filter(t => t.status === 'confirmed') || [];
  const recentTrips = state?.trips?.filter(t => t.status === 'completed').slice(0, 10) || [];
  const demandColor = (level) => level === 'high' ? 'var(--amber)' : level === 'normal' ? 'var(--green)' : 'var(--blue)';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* Header */}
      <div style={{ animation: 'float-up 0.5s ease both', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-1px', color: 'var(--text)' }}>Control Panel</h1>
          <div style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.3)', fontSize: 11, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-display)', letterSpacing: '1px' }}>ADMIN</div>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>Manage fleet, update status, monitor trips in real-time</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, animation: 'float-up 0.5s ease 0.05s both' }}>
        {[
          { label: 'At Gate',      value: autosAtGate,          color: 'var(--amber)', icon: '🛺' },
          { label: 'Active Trips', value: activeTrips.length,   color: 'var(--green)', icon: '🚦' },
          { label: 'Total Fleet',  value: state?.autos?.length || 0, color: 'var(--blue)',  icon: '📊' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.5px' }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Demand Forecast */}
      {forecast && (
        <div style={{ animation: 'float-up 0.5s ease 0.08s both', marginBottom: 20 }}>
          <SectionHeader>AI Demand Forecast</SectionHeader>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'NEXT PEAK',          value: forecast.next_peak || 'None today', color: 'var(--amber)' },
                { label: 'RECOMMENDED AUTOS',  value: `${forecast.recommended_autos} at gate`, color: 'var(--green)' },
                { label: 'CURRENT DEMAND',     value: forecast.current_demand_level, color: demandColor(forecast.current_demand_level) },
                { label: 'MODEL CONFIDENCE',   value: `${forecast.model_confidence}%`, color: 'var(--blue)' },
              ].map(item => (
                <div key={item.label} style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--border)', flex: '1 1 120px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4, letterSpacing: '0.5px' }}>{item.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: item.color, fontFamily: 'var(--font-display)', textTransform: 'capitalize' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {/* Bar chart */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
              {forecast.forecast.map((f, i) => {
                const maxTrips = 15;
                const h = Math.max(8, (f.predicted_trips / maxTrips) * 70);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{f.predicted_trips}</div>
                    <div style={{ width: '100%', height: h, borderRadius: 4, background: demandColor(f.demand_level), opacity: i === 0 ? 1 : 0.55 + i * 0.05, transition: 'height 0.5s' }} />
                    <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>{f.hour}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)', textAlign: 'right' }}>
              Pattern-based model · trained on campus trip logs · LSTM pipeline ready
            </div>
          </div>
        </div>
      )}

      {/* Quick Controls */}
      <div style={{ animation: 'float-up 0.5s ease 0.1s both', marginBottom: 20 }}>
        <SectionHeader>Quick Controls</SectionHeader>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>ETA (minutes)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="1" max="60" value={eta} onChange={e => setEta(e.target.value)} placeholder={state?.eta_minutes || '5'} style={inputStyle} />
              <button onClick={() => eta && updateState({ eta_minutes: parseInt(eta) })} style={btnStyle('var(--amber)')} disabled={updating}>Set</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Demand Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={peak} onChange={e => setPeak(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                <option value="">Current: {state?.peak_status || 'normal'}</option>
                <option value="normal">Normal</option>
                <option value="high">Peak Hours</option>
                <option value="low">Quiet</option>
              </select>
              <button onClick={() => peak && updateState({ peak_status: peak })} style={btnStyle('var(--blue)')} disabled={updating}>Set</button>
            </div>
          </div>
        </div>
        {msg && (
          <div style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, background: msg.includes('rror') ? 'var(--red-dim)' : 'var(--green-dim)', border: `1px solid ${msg.includes('rror') ? 'rgba(255,77,109,0.3)' : 'rgba(0,229,160,0.3)'}`, fontSize: 13, color: msg.includes('rror') ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
            {msg}
          </div>
        )}
      </div>

      {/* Fleet Management */}
      <div style={{ animation: 'float-up 0.5s ease 0.15s both', marginBottom: 20 }}>
        <SectionHeader>Fleet Management</SectionHeader>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state?.autos?.map((auto, i) => (
            <div key={auto.id} style={{
              padding: '14px 16px', borderRadius: 12, background: 'var(--bg3)',
              border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', animation: `slide-in 0.3s ease ${i * 0.04}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, position: 'relative',
                  background: auto.status === 'available' ? 'var(--green-dim)' : 'var(--amber-dim)',
                  border: `1px solid ${auto.status === 'available' ? 'rgba(0,229,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {auto.vehicle_type === 'EV' ? '⚡' : '🛺'}
                  {auto.verified && (
                    <div style={{
                      position: 'absolute', top: -4, right: -4,
                      width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: '#fff', fontWeight: 700,
                    }}>✓</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {auto.driver_name}
                    {auto.vehicle_type === 'EV' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(0,229,160,0.3)' }}>EV</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                    📍 {auto.location} · ID #{auto.id} · {auto.lat?.toFixed(4)}, {auto.lng?.toFixed(4)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
                  letterSpacing: '0.5px', padding: '3px 10px', borderRadius: 20,
                  background: auto.status === 'available' ? 'var(--green-dim)' : 'var(--amber-dim)',
                  color: auto.status === 'available' ? 'var(--green)' : 'var(--amber)',
                }}>
                  {auto.status === 'available' ? 'AVAILABLE' : 'ON TRIP'}
                </div>
                <button onClick={() => toggleAuto(auto)} style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border-bright)', background: 'var(--surface2)',
                  color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-display)',
                  letterSpacing: '0.3px', transition: 'all 0.15s',
                }}>
                  {auto.status === 'available' ? 'Mark Busy' : 'Mark Free'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Trips */}
      {activeTrips.length > 0 && (
        <div style={{ animation: 'float-up 0.5s ease 0.2s both', marginBottom: 20 }}>
          <SectionHeader>Active Trips</SectionHeader>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeTrips.map((trip, i) => (
              <div key={trip.id} style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                animation: `slide-in 0.3s ease ${i * 0.05}s both`,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{trip.pickup} → {trip.dropoff}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span>👤 {trip.student_name}</span>
                    <span>·</span>
                    <span>Trip #{trip.id}</span>
                    <span>·</span>
                    <span>{new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <button onClick={() => completeTrip(trip.id)} style={btnStyle('var(--green)')}>Complete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip Log */}
      {recentTrips.length > 0 && (
        <div style={{ animation: 'float-up 0.5s ease 0.25s both' }}>
          <SectionHeader>Trip Log</SectionHeader>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentTrips.map((trip, i) => (
              <div key={trip.id} style={{
                padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)',
                border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                animation: `slide-in 0.3s ease ${i * 0.03}s both`,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                    {trip.pickup} → {trip.dropoff}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {trip.student_name} · {new Date(trip.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'var(--font-display)' }}>DONE</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-faint)', marginBottom: 10 }}>{children.toUpperCase()}</div>;
}

const labelStyle = { fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 };
const inputStyle = { flex: 1, padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' };
const btnStyle = (color) => ({ padding: '10px 16px', borderRadius: 10, border: 'none', background: color, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: '#0a0a0f', whiteSpace: 'nowrap', letterSpacing: '0.3px' });
