import React, { useState, useEffect, useRef } from 'react';
import MapView from './MapView';

// ── Push notification helper ──────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function sendPushNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export default function StudentApp({ state, backend, onRefetch, lastUpdate, offline }) {
  const [form, setForm] = useState({ student_name: '', pickup: '', dropoff: '' });
  const [submitting, setSubmitting] = useState(false);
  const [tripResult, setTripResult] = useState(null);
  const [error, setError] = useState('');
  const [prevCount, setPrevCount] = useState(null);
  const [countAnimating, setCountAnimating] = useState(false);

  const autosAtGate = state ? parseInt(state.autos_at_gate || '0') : null;
  const eta = state ? state.eta_minutes : null;
  const peakStatus = state ? state.peak_status : 'normal';

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (prevCount !== null && prevCount !== autosAtGate) {
      setCountAnimating(true);
      setTimeout(() => setCountAnimating(false), 500);
    }
    setPrevCount(autosAtGate);
  }, [autosAtGate]);

  const peakColors = {
    normal: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Normal',     border: 'rgba(0,229,160,0.25)' },
    high:   { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Peak Hours', border: 'rgba(245,166,35,0.25)' },
    low:    { color: 'var(--blue)',  bg: 'var(--blue-dim)',  label: 'Quiet',      border: 'rgba(77,159,255,0.25)' },
  };
  const peak = peakColors[peakStatus] || peakColors.normal;

  const handleRequest = async () => {
    if (!form.student_name.trim() || !form.pickup.trim() || !form.dropoff.trim()) {
      setError('Please fill in all fields'); return;
    }
    setSubmitting(true); setError(''); setTripResult(null);
    try {
      const res = await fetch(`${backend}/api/trip/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Request failed'); }
      else {
        setTripResult(data);
        setForm({ student_name: '', pickup: '', dropoff: '' });
        onRefetch();
        sendPushNotification(
          '🛺 Ride Confirmed!',
          `Driver: ${data.driver} · Trip #${data.tripId} · From ${form.pickup}`
        );
      }
    } catch (e) { setError('Could not connect to server'); }
    setSubmitting(false);
  };

  const STOPS = ['Main Gate 1', 'Main Gate 2', 'Rajpur Khurd Road', 'Gaushala Road'];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* Hero — Radar + Count */}
      <div style={{ animation: 'float-up 0.6s ease both', marginBottom: 20 }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 24, padding: '36px 24px 28px',
          position: 'relative', overflow: 'hidden', textAlign: 'center',
        }}>
          <div style={{
            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
            width: 200, height: 200,
            background: autosAtGate > 0
              ? 'radial-gradient(circle, rgba(245,166,35,0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,77,109,0.1) 0%, transparent 70%)',
            pointerEvents: 'none', transition: 'background 1s',
          }} />

          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}>
            {autosAtGate > 0 && [0,1,2].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid var(--amber)',
                animation: 'pulse-ring 2.4s ease-out infinite',
                animationDelay: `${i * 0.8}s`, opacity: 0,
              }} />
            ))}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: autosAtGate > 0 ? 'var(--amber-dim)' : 'var(--red-dim)',
              border: `2px solid ${autosAtGate > 0 ? 'var(--amber)' : 'var(--red)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.8s',
            }}>
              <span style={{ fontSize: 36 }}>🛺</span>
            </div>
          </div>

          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 72, lineHeight: 1, letterSpacing: '-4px',
            color: autosAtGate > 0 ? 'var(--amber)' : 'var(--red)',
            animation: countAnimating ? 'count-pop 0.4s ease' : 'none',
            transition: 'color 0.5s', marginBottom: 4,
          }}>
            {autosAtGate !== null ? autosAtGate : '—'}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: 16 }}>
            AUTOS AVAILABLE AT GATE
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>⏱</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>~{eta || '—'} min ETA</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: peak.bg, border: `1px solid ${peak.border}` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: peak.color }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: peak.color }}>{peak.label}</span>
            </div>
          </div>

          {lastUpdate && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>
              {offline ? '⚠️ Cached · ' : 'Live · '}Updated {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Live Map */}
      {state?.autos && (
        <div style={{ animation: 'float-up 0.6s ease 0.05s both', marginBottom: 20 }}>
          <SectionLabel>LIVE MAP · SAU CAMPUS</SectionLabel>
          <MapView autos={state.autos} />
        </div>
      )}

      {/* Fleet Status */}
      {state?.autos && (
        <div style={{ animation: 'float-up 0.6s ease 0.1s both', marginBottom: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
            <SectionLabel>FLEET STATUS</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {state.autos.map(auto => (
                <div key={auto.id} style={{
                  padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  background: auto.status === 'available' ? 'var(--green-dim)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${auto.status === 'available' ? 'rgba(0,229,160,0.25)' : 'var(--border)'}`,
                  color: auto.status === 'available' ? 'var(--green)' : 'var(--text-faint)',
                  display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.4s',
                }}>
                  <span>{auto.status === 'available' ? '●' : '○'}</span>
                  {auto.driver_name}
                  {auto.verified && <span style={{ color: 'var(--blue)', fontSize: 10 }}>✓</span>}
                  {auto.vehicle_type === 'EV' && <span style={{ fontSize: 10, color: 'var(--green)' }}>⚡</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Trip Request */}
      <div style={{ animation: 'float-up 0.6s ease 0.2s both', marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '24px 20px' }}>
          <SectionLabel>REQUEST A RIDE</SectionLabel>

          {tripResult ? (
            <div style={{
              padding: '20px', borderRadius: 14,
              background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.3)',
              animation: 'float-up 0.4s ease both',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--green)', marginBottom: 8 }}>
                Ride Confirmed!
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-dim)' }}>
                <span>Trip <strong style={{ color: 'var(--text)' }}>#{tripResult.tripId}</strong></span>
                <span>Driver: <strong style={{ color: 'var(--text)' }}>{tripResult.driver}</strong></span>
                <span>Auto ID: <strong style={{ color: 'var(--text)' }}>#{tripResult.auto_id}</strong></span>
                {tripResult.vehicle_type === 'EV' && (
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>⚡ Electric Vehicle</span>
                )}
              </div>
              <button onClick={() => setTripResult(null)} style={{
                marginTop: 14, padding: '8px 20px', borderRadius: 20,
                background: 'var(--green)', color: '#0a0a0f',
                border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                fontFamily: 'var(--font-display)',
              }}>Book Another</button>
            </div>
          ) : (
            <>
              <InputField label="Your Name" placeholder="e.g. Shubham" value={form.student_name} onChange={v => setForm(f => ({ ...f, student_name: v }))} />
              <SelectField label="Pickup Point" value={form.pickup} onChange={v => setForm(f => ({ ...f, pickup: v }))} options={STOPS} />
              <SelectField label="Drop-off Point" value={form.dropoff} onChange={v => setForm(f => ({ ...f, dropoff: v }))} options={STOPS} />

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', fontSize: 13, color: 'var(--red)' }}>
                  {error}
                </div>
              )}

              <button onClick={handleRequest} disabled={submitting || autosAtGate === 0} style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                cursor: submitting || autosAtGate === 0 ? 'not-allowed' : 'pointer',
                background: submitting || autosAtGate === 0 ? 'var(--surface2)' : 'var(--amber)',
                color: submitting || autosAtGate === 0 ? 'var(--text-faint)' : '#0a0a0f',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                letterSpacing: '0.5px', transition: 'all 0.2s',
                boxShadow: submitting || autosAtGate === 0 ? 'none' : '0 4px 20px rgba(245,166,35,0.35)',
              }}>
                {submitting ? 'Requesting...' : autosAtGate === 0 ? 'No Autos Available' : '🛺  Request Auto'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recent Trips */}
      {state?.trips?.length > 0 && (
        <div style={{ animation: 'float-up 0.6s ease 0.3s both' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '20px' }}>
            <SectionLabel>RECENT TRIPS</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.trips.slice(0, 5).map((trip, i) => (
                <div key={trip.id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  animation: `slide-in 0.3s ease ${i * 0.05}s both`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {trip.pickup} → {trip.dropoff}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, display: 'flex', gap: 8 }}>
                      <span>{trip.student_name}</span>
                      <span>·</span>
                      <span>{new Date(trip.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <StatusBadge status={trip.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-faint)', marginBottom: 12 }}>
      {children}
    </div>
  );
}

function InputField({ label, placeholder, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>
        {label.toUpperCase()}
      </label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', padding: '12px 14px', background: 'var(--bg3)',
        border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)',
        fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color 0.2s',
      }}
        onFocus={e => e.target.style.borderColor = 'rgba(245,166,35,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>
        {label.toUpperCase()}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', padding: '12px 14px', background: 'var(--bg3)',
        border: '1px solid var(--border)', borderRadius: 10,
        color: value ? 'var(--text)' : 'var(--text-faint)',
        fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
        cursor: 'pointer', appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='rgba(240,240,248,0.3)' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
      }}>
        <option value="">Select a stop...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    confirmed: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Active' },
    completed: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Done' },
    requested: { color: 'var(--blue)',  bg: 'var(--blue-dim)',  label: 'Pending' },
  };
  const c = cfg[status] || cfg.requested;
  return (
    <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, fontFamily: 'var(--font-display)', letterSpacing: '0.5px' }}>
      {c.label}
    </div>
  );
}
