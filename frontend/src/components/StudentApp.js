import React, { useState, useEffect } from 'react';
import MapView from './MapView';

const STOPS = {
  'Main Gate 1':       { lat: 28.481506696970786, lng: 77.20156655401924 },
  'Main Gate 2':       { lat: 28.484021948032776, lng: 77.1983732789934  },
  'Rajpur Khurd Road': { lat: 28.488978658164335, lng: 77.19388845282725 },
  'Gaushala Road':     { lat: 28.48331524485649,  lng: 77.18885118170873 },
};
const STOP_NAMES = Object.keys(STOPS);
const GEOFENCE_RADIUS_M = 50;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestStop(userLat, userLng) {
  let nearest = null, minDist = Infinity;
  for (const [name, pos] of Object.entries(STOPS)) {
    const d = haversineDistance(userLat, userLng, pos.lat, pos.lng);
    if (d < minDist) { minDist = d; nearest = name; }
  }
  return { nearest, distance: Math.round(minDist), withinFence: minDist <= GEOFENCE_RADIUS_M };
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function sendPushNotification(title, body) {
  if (Notification.permission === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
}

// Props:
//   state, backend, onRefetch, lastUpdate, offline
//   studentToken  — JWT string
//   studentName   — name from JWT / localStorage
//   onLogout()    — clears auth and returns to AuthScreen

export default function StudentApp({ state, backend, onRefetch, lastUpdate, offline, studentToken, studentName, onLogout }) {
  const [form, setForm] = useState({ pickup: '', dropoff: '' });
  const [submitting, setSubmitting] = useState(false);
  const [tripResult, setTripResult] = useState(null);
  const [error, setError] = useState('');
  const [prevCount, setPrevCount] = useState(null);
  const [countAnimating, setCountAnimating] = useState(false);
  const [geoStatus, setGeoStatus] = useState('idle');
  const [geoInfo, setGeoInfo] = useState(null);
  const [geoError, setGeoError] = useState('');

  const autosAtGate = state ? parseInt(state.autos_at_gate || '0') : null;
  const eta = state?.eta_minutes;
  const peakStatus = state?.peak_status || 'normal';

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (prevCount !== null && prevCount !== autosAtGate) {
      setCountAnimating(true);
      setTimeout(() => setCountAnimating(false), 500);
    }
    setPrevCount(autosAtGate);
  }, [autosAtGate]);

  const checkGeofence = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); setGeoError('GPS not available on this device.'); return; }
    setGeoStatus('checking');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const info = getNearestStop(pos.coords.latitude, pos.coords.longitude);
        setGeoInfo(info);
        setGeoStatus(info.withinFence ? 'allowed' : 'denied');
        if (info.withinFence) setForm(f => ({ ...f, pickup: info.nearest }));
      },
      err => {
        setGeoStatus('error');
        setGeoError(err.code === 1 ? 'Location access denied. Please allow location permission.' : 'Could not get your location. Please try again.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const peakColors = {
    normal: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Normal',     border: 'rgba(0,229,160,0.25)' },
    high:   { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Peak Hours', border: 'rgba(245,166,35,0.25)' },
    low:    { color: 'var(--blue)',  bg: 'var(--blue-dim)',  label: 'Quiet',      border: 'rgba(77,159,255,0.25)' },
  };
  const peak = peakColors[peakStatus] || peakColors.normal;

  const handleRequest = async () => {
    if (!form.pickup || !form.dropoff) { setError('Please select pickup and drop-off points'); return; }
    if (form.pickup === form.dropoff)  { setError('Pickup and drop-off cannot be the same stop'); return; }
    setSubmitting(true); setError(''); setTripResult(null);
    try {
      const res = await fetch(`${backend}/api/trip/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
        body: JSON.stringify({ pickup: form.pickup, dropoff: form.dropoff }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed');
        if (res.status === 401 || res.status === 403) onLogout();
      } else {
        setTripResult(data);
        setForm({ pickup: '', dropoff: '' });
        setGeoStatus('idle');
        onRefetch();
        sendPushNotification('🛺 Ride Confirmed!', `Driver: ${data.driver} · Trip #${data.tripId}`);
      }
    } catch { setError('Could not connect to server'); }
    setSubmitting(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* Greeting + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          👋 <span style={{ color: 'var(--text)', fontWeight: 600 }}>{studentName}</span>
        </div>
        <button onClick={onLogout} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text-faint)', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>

      {/* Hero */}
      <div style={{ animation: 'float-up 0.6s ease both', marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '36px 24px 28px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 200, background: autosAtGate > 0 ? 'radial-gradient(circle, rgba(245,166,35,0.15) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(255,77,109,0.1) 0%, transparent 70%)', pointerEvents: 'none', transition: 'background 1s' }} />
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}>
            {autosAtGate > 0 && [0,1,2].map(i => (
              <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--amber)', animation: 'pulse-ring 2.4s ease-out infinite', animationDelay: `${i * 0.8}s`, opacity: 0 }} />
            ))}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: autosAtGate > 0 ? 'var(--amber-dim)' : 'var(--red-dim)', border: `2px solid ${autosAtGate > 0 ? 'var(--amber)' : 'var(--red)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.8s' }}>
              <span style={{ fontSize: 36 }}>🛺</span>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 72, lineHeight: 1, letterSpacing: '-4px', color: autosAtGate > 0 ? 'var(--amber)' : 'var(--red)', animation: countAnimating ? 'count-pop 0.4s ease' : 'none', transition: 'color 0.5s', marginBottom: 4 }}>
            {autosAtGate !== null ? autosAtGate : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: 16 }}>AUTOS AVAILABLE AT GATE</div>
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
                <div key={auto.id} style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: auto.status === 'available' ? 'var(--green-dim)' : 'rgba(255,255,255,0.05)', border: `1px solid ${auto.status === 'available' ? 'rgba(0,229,160,0.25)' : 'var(--border)'}`, color: auto.status === 'available' ? 'var(--green)' : 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 5 }}>
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
            <div style={{ padding: '20px', borderRadius: 14, background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.3)', animation: 'float-up 0.4s ease both' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--green)', marginBottom: 8 }}>Ride Confirmed!</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-dim)' }}>
                <span>Trip <strong style={{ color: 'var(--text)' }}>#{tripResult.tripId}</strong></span>
                <span>Driver: <strong style={{ color: 'var(--text)' }}>{tripResult.driver}</strong></span>
                <span>Auto ID: <strong style={{ color: 'var(--text)' }}>#{tripResult.auto_id}</strong></span>
                {tripResult.vehicle_type === 'EV' && <span style={{ color: 'var(--green)', fontWeight: 600 }}>⚡ Electric Vehicle</span>}
              </div>
              <button onClick={() => setTripResult(null)} style={{ marginTop: 14, padding: '8px 20px', borderRadius: 20, background: 'var(--green)', color: '#0a0a0f', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-display)' }}>
                Book Another
              </button>
            </div>

          ) : geoStatus === 'idle' || geoStatus === 'error' ? (
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Confirm your location first</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.6 }}>Rides can only be booked from a campus pickup stop.</div>
              {geoStatus === 'error' && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', fontSize: 13, color: 'var(--red)', textAlign: 'left' }}>⚠️ {geoError}</div>}
              <button onClick={checkGeofence} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 20px rgba(77,159,255,0.3)' }}>
                📡  Check My Location
              </button>
            </div>

          ) : geoStatus === 'checking' ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛰️</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Getting your location…</div>
            </div>

          ) : geoStatus === 'denied' ? (
            <div style={{ padding: '20px', borderRadius: 14, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)', animation: 'float-up 0.4s ease both' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🚫</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--red)', marginBottom: 8 }}>You're not at a pickup stop</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 14 }}>
                You are <strong style={{ color: 'var(--text)' }}>{geoInfo?.distance}m</strong> from the nearest stop.
                Please walk to <strong style={{ color: 'var(--text)' }}>{geoInfo?.nearest}</strong> to book a ride.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {Object.keys(STOPS).map(name => {
                  const isNearest = name === geoInfo?.nearest;
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: isNearest ? 'rgba(77,159,255,0.1)' : 'var(--bg3)', border: `1px solid ${isNearest ? 'rgba(77,159,255,0.3)' : 'var(--border)'}` }}>
                      <span style={{ fontSize: 12, color: isNearest ? 'var(--blue)' : 'var(--text-dim)', fontWeight: isNearest ? 600 : 400 }}>{isNearest ? '📍 ' : '🔵 '}{name}</span>
                      {isNearest && <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{geoInfo.distance}m away</span>}
                    </div>
                  );
                })}
              </div>
              <button onClick={checkGeofence} style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'var(--bg3)', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                🔄  Re-check Location
              </button>
            </div>

          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, marginBottom: 16, background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.25)', fontSize: 12, color: 'var(--green)' }}>
                <span>✅</span>
                <span>At <strong>{geoInfo?.nearest}</strong><span style={{ color: 'rgba(0,229,160,0.6)', marginLeft: 4 }}>· {geoInfo?.distance}m away</span></span>
                <button onClick={() => setGeoStatus('idle')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(0,229,160,0.5)', cursor: 'pointer', fontSize: 11, padding: 0 }}>change</button>
              </div>

              <SelectField label="Pickup Point"   value={form.pickup}  onChange={v => setForm(f => ({ ...f, pickup: v }))}  options={STOP_NAMES} />
              <SelectField label="Drop-off Point" value={form.dropoff} onChange={v => setForm(f => ({ ...f, dropoff: v }))} options={STOP_NAMES} />

              {error && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', fontSize: 13, color: 'var(--red)' }}>{error}</div>}

              <button onClick={handleRequest} disabled={submitting || autosAtGate === 0} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: submitting || autosAtGate === 0 ? 'not-allowed' : 'pointer', background: submitting || autosAtGate === 0 ? 'var(--surface2)' : 'var(--amber)', color: submitting || autosAtGate === 0 ? 'var(--text-faint)' : '#0a0a0f', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.5px', transition: 'all 0.2s', boxShadow: submitting || autosAtGate === 0 ? 'none' : '0 4px 20px rgba(245,166,35,0.35)' }}>
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
                <div key={trip.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: `slide-in 0.3s ease ${i * 0.05}s both` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{trip.pickup} → {trip.dropoff}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, display: 'flex', gap: 8 }}>
                      <span>{trip.student_name}</span><span>·</span>
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
  return <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-faint)', marginBottom: 12 }}>{children}</div>;
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>{label.toUpperCase()}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: value ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='rgba(240,240,248,0.3)' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
        <option value="">Select a stop...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = { confirmed: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Active' }, completed: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Done' }, requested: { color: 'var(--blue)', bg: 'var(--blue-dim)', label: 'Pending' } };
  const c = cfg[status] || cfg.requested;
  return <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, fontFamily: 'var(--font-display)', letterSpacing: '0.5px' }}>{c.label}</div>;
}
