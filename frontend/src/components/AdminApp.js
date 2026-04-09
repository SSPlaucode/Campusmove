import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const VALID_ROUTES = [
  { pickup: 'Main Gate 1',       dropoff: 'Gaushala Road'     },
  { pickup: 'Main Gate 1',       dropoff: 'Rajpur Khurd Road' },
  { pickup: 'Main Gate 2',       dropoff: 'Gaushala Road'     },
  { pickup: 'Main Gate 2',       dropoff: 'Rajpur Khurd Road' },
  { pickup: 'Gaushala Road',     dropoff: 'Main Gate 1'       },
  { pickup: 'Gaushala Road',     dropoff: 'Main Gate 2'       },
  { pickup: 'Rajpur Khurd Road', dropoff: 'Main Gate 1'       },
  { pickup: 'Rajpur Khurd Road', dropoff: 'Main Gate 2'       },
];

export default function AdminApp({ state, backend, onRefetch, adminToken, onLogin, onLogout }) {
  if (!adminToken) return <AdminLogin backend={backend} onLogin={onLogin} />;
  return <AdminDashboard state={state} backend={backend} onRefetch={onRefetch} adminToken={adminToken} onLogout={onLogout} />;
}

// ── Admin Login ───────────────────────────────────────────────────────────────
function AdminLogin({ backend, onLogin }) {
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${backend}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Invalid password');
      else onLogin(data.token);
    } catch { setError('Could not connect to server'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--text)' }}>Admin Panel</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>CampusMove · SAU</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '28px 24px' }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin password"
            style={{ width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
          {error && <div style={errBox}>{error}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: loading ? 'var(--surface2)' : 'var(--amber)', color: loading ? 'var(--text-faint)' : '#0a0a0f', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Logging in…' : '→  Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ state, backend, onRefetch, adminToken, onLogout }) {
  const [tab, setTab] = useState('queues'); // 'queues' | 'fleet' | 'forecast' | 'drivers'
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const auth = { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  const adminPost = async (path, body) => {
    const res = await fetch(`${backend}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const handleUpdateState = async (key, value) => {
    setUpdating(true); setError('');
    try { await adminPost('/api/admin/update', { [key]: value }); onRefetch(); }
    catch (e) { setError(e.message); }
    setUpdating(false);
  };

  const handleCompleteGroup = async (groupId) => {
    setError('');
    try { await adminPost(`/api/admin/group/${groupId}/complete`, {}); onRefetch(); }
    catch (e) { setError(e.message); }
  };

  const handleDispatchNow = async () => {
    setError('');
    try { await adminPost('/api/admin/queue/dispatch', {}); onRefetch(); }
    catch (e) { setError(e.message); }
  };

  const handleToggleAuto = async (auto) => {
    setError('');
    const newStatus = auto.status === 'available' ? 'offline' : 'available';
    try { await adminPost(`/api/admin/auto/${auto.id}`, { status: newStatus, location: auto.location || 'gate' }); onRefetch(); }
    catch (e) { setError(e.message); }
  };

  const tabs = [
    { id: 'queues',   label: '📋 Queues'   },
    { id: 'fleet',    label: '🛺 Fleet'    },
    { id: 'forecast', label: '📈 Forecast' },
    { id: 'drivers',  label: '🔑 Drivers'  },
  ];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>Admin Panel</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {state?.available_autos ?? '—'} autos available · {
              state ? Object.values(state.queues || {}).reduce((a,b) => a + b.filter(e => e.status === 'waiting').length, 0) : '—'
            } students waiting
          </div>
        </div>
        <button onClick={onLogout} style={btnSmall}>Sign Out</button>
      </div>

      {error && <div style={{ ...errBox, marginBottom: 16 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: 4, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--amber)' : 'transparent',
              color: tab === t.id ? '#0a0a0f' : 'var(--text-faint)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Queues Tab ── */}
      {tab === 'queues' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionLabel>ALL 8 ROUTE QUEUES</SectionLabel>
            <button onClick={handleDispatchNow} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(245,166,35,0.4)', background: 'var(--amber-dim)', color: 'var(--amber)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer' }}>
              ⚡ Force Dispatch
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {VALID_ROUTES.map(route => {
              const key = `${route.pickup}|${route.dropoff}`;
              const entries = state?.queues?.[key] || [];
              const waiting    = entries.filter(e => e.status === 'waiting');
              const dispatched = entries.filter(e => e.status === 'dispatched');
              const started    = entries.filter(e => e.status === 'started');
              const hasActive  = dispatched.length > 0 || started.length > 0;
              const groupId    = dispatched[0]?.group_id || started[0]?.group_id;

              return (
                <div key={key} style={{ background: 'var(--surface)', border: `1px solid ${hasActive ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`, borderRadius: 16, padding: '16px 18px', transition: 'border 0.3s' }}>
                  {/* Route header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {route.pickup} <span style={{ color: 'var(--text-faint)' }}>→</span> {route.dropoff}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {waiting.length > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,166,35,0.3)', fontWeight: 700 }}>
                          {waiting.length} waiting
                        </span>
                      )}
                      {hasActive && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: started.length ? 'var(--green-dim)' : 'var(--amber-dim)', color: started.length ? 'var(--green)' : 'var(--amber)', border: `1px solid ${started.length ? 'rgba(0,229,160,0.3)' : 'rgba(245,166,35,0.3)'}`, fontWeight: 700 }}>
                          {started.length ? '▶ On Trip' : '🛺 Dispatched'}
                        </span>
                      )}
                      {!waiting.length && !hasActive && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>empty</span>
                      )}
                    </div>
                  </div>

                  {/* Active group */}
                  {hasActive && (
                    <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: started.length ? 'var(--green-dim)' : 'var(--amber-dim)', border: `1px solid ${started.length ? 'rgba(0,229,160,0.25)' : 'rgba(245,166,35,0.25)'}` }}>
                      <div style={{ fontSize: 11, color: started.length ? 'var(--green)' : 'var(--amber)', fontWeight: 700, marginBottom: 6 }}>
                        {started.length ? '▶ IN PROGRESS' : '🛺 DRIVER ASSIGNED'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {[...dispatched, ...started].map(e => (
                          <span key={e.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}>
                            {e.student_name}
                          </span>
                        ))}
                      </div>
                      <button onClick={() => handleCompleteGroup(groupId)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,229,160,0.4)', background: 'transparent', color: 'var(--green)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer' }}>
                        ✓ Mark Complete
                      </button>
                    </div>
                  )}

                  {/* Waiting list */}
                  {waiting.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {waiting.map((entry, i) => {
                        const waitMs = Date.now() - new Date(entry.created_at).getTime();
                        const waitMin = Math.floor(waitMs / 60000);
                        return (
                          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg3)' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', width: 20 }}>#{i+1}</span>
                            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{entry.student_name}</span>
                            <span style={{ fontSize: 11, color: waitMin >= 4 ? 'var(--amber)' : 'var(--text-faint)' }}>
                              {waitMin}m ago
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Queue fill bar */}
                  {waiting.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((waiting.length / 4) * 100, 100)}%`, background: 'var(--amber)', borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{waiting.length}/4 capacity</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fleet Tab ── */}
      {tab === 'fleet' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionLabel>FLEET MANAGEMENT</SectionLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Label>ETA (min)</Label>
              <select value={state?.eta_minutes || '8'} onChange={e => handleUpdateState('eta_minutes', e.target.value)} style={{ padding: '5px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                {[3,5,8,10,12,15].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <Label>Status</Label>
              <select value={state?.peak_status || 'normal'} onChange={e => handleUpdateState('peak_status', e.target.value)} style={{ padding: '5px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                <option value="normal">Normal</option>
                <option value="high">Peak</option>
                <option value="low">Quiet</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(state?.autos || []).map(auto => (
              <div key={auto.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: auto.status === 'available' ? 'var(--green)' : auto.status === 'on_trip' ? 'var(--amber)' : 'var(--red)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {auto.driver_name}
                    {auto.vehicle_type === 'EV' && <span style={{ color: 'var(--green)', marginLeft: 6, fontSize: 12 }}>⚡ EV</span>}
                    {auto.verified && <span style={{ color: 'var(--blue)', marginLeft: 6, fontSize: 11 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    {auto.status} · {auto.location || 'gate'}
                    {auto.vehicle_type === 'EV' && (
                      <span style={{ marginLeft: 6, color: 'rgba(0,229,160,0.5)' }}>
                        · schedule: 8:30–10:30, 15:30–18:00
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleToggleAuto(auto)}
                  disabled={auto.status === 'on_trip'}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: auto.status === 'on_trip' ? 'var(--text-faint)' : 'var(--text)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: auto.status === 'on_trip' ? 'not-allowed' : 'pointer' }}>
                  {auto.status === 'available' ? 'Take Offline' : auto.status === 'on_trip' ? 'On Trip' : 'Bring Online'}
                </button>
              </div>
            ))}
          </div>

          {/* Trip log */}
          {state?.trips?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <SectionLabel>RECENT COMPLETED TRIPS</SectionLabel>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                {state.trips.slice(0, 10).map((t, i) => (
                  <div key={t.id} style={{ padding: '10px 16px', borderBottom: i < 9 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{t.student_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.pickup} → {t.dropoff}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {t.completed_at ? new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Forecast Tab ── */}
      {tab === 'forecast' && state?.forecast && (
        <div>
          <SectionLabel>AI DEMAND FORECAST — NEXT 6 HOURS</SectionLabel>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px 16px 12px', marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={state.forecast.forecast} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="predicted_trips" radius={[4,4,0,0]}>
                  {state.forecast.forecast.map((f, i) => (
                    <Cell key={i} fill={f.demand_level === 'high' ? 'var(--amber)' : f.demand_level === 'normal' ? '#4d9fff' : '#444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Next Peak', value: state.forecast.next_peak || 'None' },
              { label: 'Recommended Autos', value: state.forecast.recommended_autos },
              { label: 'Current Demand', value: state.forecast.current_demand_level },
              { label: 'Model Confidence', value: `${state.forecast.model_confidence}%` },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{item.label.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drivers / PIN Tab ── */}
      {tab === 'drivers' && (
        <DriverPINManager autos={state?.autos || []} backend={backend} adminToken={adminToken} onRefetch={onRefetch} />
      )}
    </div>
  );
}

// ── Driver PIN Manager ────────────────────────────────────────────────────────
function DriverPINManager({ autos, backend, adminToken, onRefetch }) {
  const [pins,    setPins]    = useState({});
  const [saving,  setSaving]  = useState({});
  const [msg,     setMsg]     = useState({});

  const handleSave = async (driverId) => {
    const pin = pins[driverId];
    if (!pin || pin.length < 4) { setMsg(m => ({ ...m, [driverId]: 'PIN must be at least 4 digits' })); return; }
    setSaving(s => ({ ...s, [driverId]: true }));
    try {
      const res = await fetch(`${backend}/api/admin/driver/${driverId}/pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(m => ({ ...m, [driverId]: data.error }));
      else {
        setMsg(m => ({ ...m, [driverId]: '✓ PIN updated' }));
        setPins(p => ({ ...p, [driverId]: '' }));
        setTimeout(() => setMsg(m => ({ ...m, [driverId]: '' })), 3000);
      }
    } catch { setMsg(m => ({ ...m, [driverId]: 'Error saving' })); }
    setSaving(s => ({ ...s, [driverId]: false }));
  };

  return (
    <div>
      <SectionLabel>DRIVER PINS</SectionLabel>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
        Set or reset each driver's login PIN. Drivers use their PIN to access the Driver Portal.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {autos.map(auto => (
          <div key={auto.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {auto.driver_name}
                  {auto.vehicle_type === 'EV' && <span style={{ color: 'var(--green)', marginLeft: 6, fontSize: 12 }}>⚡</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Driver ID: {auto.id}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password" inputMode="numeric" maxLength={8}
                value={pins[auto.id] || ''}
                onChange={e => setPins(p => ({ ...p, [auto.id]: e.target.value }))}
                placeholder="New PIN (min 4 digits)"
                style={{ flex: 1, padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }}
              />
              <button onClick={() => handleSave(auto.id)} disabled={saving[auto.id]}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--amber)', color: '#0a0a0f', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, cursor: saving[auto.id] ? 'not-allowed' : 'pointer' }}>
                {saving[auto.id] ? '…' : 'Save'}
              </button>
            </div>
            {msg[auto.id] && (
              <div style={{ fontSize: 12, marginTop: 6, color: msg[auto.id].startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                {msg[auto.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const errBox = {
  padding: '10px 14px', borderRadius: 10,
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
  return <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>{children}</label>;
}
