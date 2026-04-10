import React, { useState, useEffect, useCallback } from 'react';
import MapView from './MapView';

const STOPS = {
  'Main Gate 1':       { lat: 28.481506696970786, lng: 77.20156655401924 },
  'Main Gate 2':       { lat: 28.484021948032776, lng: 77.19837327899340 },
  'Rajpur Khurd Road': { lat: 28.488978658164335, lng: 77.19388845282725 },
  'Gaushala Road':     { lat: 28.483315244856490, lng: 77.18885118170873 },
};

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

const STOP_NAMES   = Object.keys(STOPS);
const GEOFENCE_M   = 150;
const AVG_TRIP_MIN = 8; // used to estimate wait time per position

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getNearestStop(userLat, userLng) {
  let nearest = null, minDist = Infinity;
  for (const [name, pos] of Object.entries(STOPS)) {
    const d = haversineDistance(userLat, userLng, pos.lat, pos.lng);
    if (d < minDist) { minDist = d; nearest = name; }
  }
  return { nearest, distance: Math.round(minDist), withinFence: minDist <= GEOFENCE_M };
}

// ── Operating hours helpers ───────────────────────────────────────────────────
function getISTMinutes() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() * 60 + ist.getMinutes();
}

function isOperatingHour() {
  const mins = getISTMinutes();
  return (mins >= 8*60+30 && mins < 18*60);
}

function nextShiftLabel() {
  const mins = getISTMinutes();
  if (mins < 8*60+30) return '8:30 AM';
  return '8:30 AM tomorrow';
}

function sendPush(title, body) {
  if (Notification.permission === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
}

function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function getValidDropoffs(pickup) {
  return VALID_ROUTES.filter(r => r.pickup === pickup).map(r => r.dropoff);
}

export default function StudentApp({ state, backend, onRefetch, lastUpdate, offline, studentToken, studentName, onLogout }) {
  const [form,       setForm]       = useState({ pickup: '', dropoff: '' });
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeEntry,setActiveEntry]= useState(null);
  const [error,      setError]      = useState('');
  const [geoStatus,  setGeoStatus]  = useState('idle');
  const [geoInfo,    setGeoInfo]    = useState(null);
  const [geoError,   setGeoError]   = useState('');
  const [countAnim,  setCountAnim]  = useState(false);
  const [prevCount,  setPrevCount]  = useState(null);
  const [showGrievance, setShowGrievance] = useState(false);

  const studentId = decodeToken(studentToken)?.id;
  const availableAutos = state?.available_autos ?? 0;
  const peakStatus = state?.peak_status || 'normal';

  // ── Sync active entry from server state queues ────────────────────────────
  useEffect(() => {
    if (!state?.queues || !studentId) return;
    let found = null;
    for (const entries of Object.values(state.queues)) {
      const mine = entries.find(e => e.student_id === studentId && ['waiting','dispatched','started'].includes(e.status));
      if (mine) { found = mine; break; }
    }
    setActiveEntry(found || null);
  }, [state, studentId]);

  useEffect(() => { if ('Notification' in window) Notification.requestPermission(); }, []);

  useEffect(() => {
    if (prevCount !== null && prevCount !== availableAutos) {
      setCountAnim(true);
      setTimeout(() => setCountAnim(false), 500);
    }
    setPrevCount(availableAutos);
  }, [availableAutos]);

  // Auto-clear error
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const checkGeofence = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); setGeoError('GPS not available.'); return; }
    setGeoStatus('checking');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const info = getNearestStop(pos.coords.latitude, pos.coords.longitude);
        setGeoInfo(info);
        setGeoStatus(info.withinFence ? 'allowed' : 'denied');
        if (info.withinFence) setForm(f => ({ ...f, pickup: info.nearest, dropoff: '' }));
      },
      err => {
        setGeoStatus('error');
        setGeoError(err.code === 1 ? 'Location access denied.' : 'Could not get location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleJoin = async () => {
    if (!form.pickup || !form.dropoff) { setError('Select pickup and drop-off'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${backend}/api/queue/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
        body: JSON.stringify({ pickup: form.pickup, dropoff: form.dropoff }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not join queue');
        if (res.status === 401 || res.status === 403) onLogout();
      } else {
        setForm({ pickup: '', dropoff: '' });
        setGeoStatus('idle');
        onRefetch();
        sendPush('🛺 Joined Queue!', `You're #${data.position} for ${form.pickup} → ${form.dropoff}`);
      }
    } catch { setError('Could not connect to server'); }
    setSubmitting(false);
  };

  const handleCancel = async () => {
    if (!activeEntry) return;
    if (!window.confirm('Leave this queue? You will go to the back if you rebook.')) return;
    setCancelling(true); setError('');
    try {
      const res = await fetch(`${backend}/api/queue/${activeEntry.id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not cancel');
      else { setActiveEntry(null); onRefetch(); }
    } catch { setError('Could not connect to server'); }
    setCancelling(false);
  };

  const peakColors = {
    normal: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Normal',     border: 'rgba(0,229,160,0.25)' },
    high:   { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Peak Hours', border: 'rgba(245,166,35,0.25)' },
    low:    { color: 'var(--blue)',  bg: 'var(--blue-dim)',  label: 'Quiet',      border: 'rgba(77,159,255,0.25)' },
  };
  const peak = peakColors[peakStatus] || peakColors.normal;

  const validDropoffs = form.pickup ? getValidDropoffs(form.pickup) : [];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          👋 <span style={{ color: 'var(--text)', fontWeight: 600 }}>{studentName}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowGrievance(true)} style={{ ...btnSmall, color: 'var(--red)', borderColor: 'rgba(255,77,109,0.3)' }}>⚠️ Report</button>
          <button onClick={onLogout} style={btnSmall}>Sign Out</button>
        </div>
      </div>

      {/* Hero — Available Autos */}
      <div style={{ animation: 'float-up 0.6s ease both', marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '36px 24px 28px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 200,
            background: availableAutos > 0 ? 'radial-gradient(circle, rgba(245,166,35,0.15) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(255,77,109,0.1) 0%, transparent 70%)',
            pointerEvents: 'none', transition: 'background 1s' }} />
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}>
            {availableAutos > 0 && [0,1,2].map(i => (
              <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--amber)', animation: 'pulse-ring 2.4s ease-out infinite', animationDelay: `${i*0.8}s`, opacity: 0 }} />
            ))}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
              background: availableAutos > 0 ? 'var(--amber-dim)' : 'var(--red-dim)',
              border: `2px solid ${availableAutos > 0 ? 'var(--amber)' : 'var(--red)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.8s' }}>
              <span style={{ fontSize: 36 }}>🛺</span>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 72, lineHeight: 1,
            letterSpacing: '-4px', color: availableAutos > 0 ? 'var(--amber)' : 'var(--red)',
            animation: countAnim ? 'count-pop 0.4s ease' : 'none', transition: 'color 0.5s', marginBottom: 4 }}>
            {availableAutos !== null ? availableAutos : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: 16 }}>AUTOS AVAILABLE</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>⏱</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>~{state?.eta_minutes || '—'} min avg</span>
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

      {/* Active Queue Entry */}
      {activeEntry && (
        <ActiveEntryCard
          entry={activeEntry}
          onCancel={handleCancel}
          cancelling={cancelling}
          state={state}
        />
      )}

      {/* Live Map */}
      {state?.autos && (
        <div style={{ animation: 'float-up 0.6s ease 0.05s both', marginBottom: 20 }}>
          <SectionLabel>LIVE MAP · SAU CAMPUS</SectionLabel>
          <MapView autos={state.autos} />
        </div>
      )}

      {/* Fleet status */}
      {state?.autos && (
        <div style={{ animation: 'float-up 0.6s ease 0.1s both', marginBottom: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
            <SectionLabel>FLEET STATUS</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {state.autos.map(auto => (
                <div key={auto.id} style={{ padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  background: auto.status === 'available' ? 'var(--green-dim)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${auto.status === 'available' ? 'rgba(0,229,160,0.25)' : 'var(--border)'}`,
                  color: auto.status === 'available' ? 'var(--green)' : 'var(--text-faint)',
                  display: 'flex', alignItems: 'center', gap: 5 }}>
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

      {/* Queue — Book a Ride */}
      {!activeEntry && (
        <div style={{ animation: 'float-up 0.6s ease 0.2s both', marginBottom: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '24px 20px' }}>
            <SectionLabel>JOIN A QUEUE</SectionLabel>

            {!isOperatingHour() ? (
              <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>🌙</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>
                  Service Not Available
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 16 }}>
                  Campus autos operate during:<br />
                  <strong style={{ color: 'var(--text)' }}>8:30 AM – 6:00 PM</strong>
                </div>
                <div style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 20,
                  background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.3)',
                  fontSize: 13, color: 'var(--amber)' }}>
                  ⏰ Next shift starts at <strong>{nextShiftLabel()}</strong>
                </div>
              </div>

            ) : geoStatus === 'idle' || geoStatus === 'error' ? (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Confirm your location first</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.6 }}>
                  Rides can only be booked from a campus pickup stop.
                </div>
                {geoStatus === 'error' && (
                  <div style={errBox}>⚠️ {geoError}</div>
                )}
                <button onClick={checkGeofence} style={btnPrimary('#4d9fff', 'rgba(77,159,255,0.3)')}>
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
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--red)', marginBottom: 8 }}>
                  You're not at a pickup stop
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 14 }}>
                  You are <strong style={{ color: 'var(--text)' }}>{geoInfo?.distance}m</strong> from the nearest stop.
                  Walk to <strong style={{ color: 'var(--text)' }}>{geoInfo?.nearest}</strong> to book.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {Object.keys(STOPS).map(name => {
                    const isNearest = name === geoInfo?.nearest;
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 8,
                        background: isNearest ? 'rgba(77,159,255,0.1)' : 'var(--bg3)',
                        border: `1px solid ${isNearest ? 'rgba(77,159,255,0.3)' : 'var(--border)'}` }}>
                        <span style={{ fontSize: 12, color: isNearest ? 'var(--blue)' : 'var(--text-dim)', fontWeight: isNearest ? 600 : 400 }}>
                          {isNearest ? '📍 ' : '🔵 '}{name}
                        </span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                  marginBottom: 16, background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.25)',
                  fontSize: 12, color: 'var(--green)' }}>
                  <span>✅</span>
                  <span>At <strong>{geoInfo?.nearest}</strong><span style={{ color: 'rgba(0,229,160,0.6)', marginLeft: 4 }}>· {geoInfo?.distance}m away</span></span>
                  <button onClick={() => setGeoStatus('idle')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(0,229,160,0.5)', cursor: 'pointer', fontSize: 11, padding: 0 }}>change</button>
                </div>

                {/* Pickup — locked to geofenced stop */}
                <div style={{ marginBottom: 14 }}>
                  <Label>PICKUP POINT</Label>
                  <div style={{ padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text-dim)' }}>
                    📍 {form.pickup || geoInfo?.nearest}
                  </div>
                </div>

                {/* Drop-off — only valid routes from this pickup */}
                <div style={{ marginBottom: 14 }}>
                  <Label>DROP-OFF POINT</Label>
                  <select value={form.dropoff} onChange={e => setForm(f => ({ ...f, dropoff: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
                      color: form.dropoff ? 'var(--text)' : 'var(--text-faint)', fontSize: 14, fontFamily: 'var(--font-body)',
                      outline: 'none', cursor: 'pointer', appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='rgba(240,240,248,0.3)' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}>
                    <option value="">Select drop-off...</option>
                    {validDropoffs.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                {/* Queue size for this route */}
                {form.pickup && form.dropoff && state?.queues && (() => {
                  const key = `${form.pickup}|${form.dropoff}`;
                  const q = state.queues[key] || [];
                  const waiting = q.filter(e => e.status === 'waiting').length;
                  return waiting > 0 ? (
                    <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 14, background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.25)', fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>👥</span>
                      <span><strong>{waiting}</strong> student{waiting !== 1 ? 's' : ''} already waiting on this route</span>
                    </div>
                  ) : null;
                })()}

                {error && <div style={errBox}>{error}</div>}

                <button onClick={handleJoin} disabled={submitting || availableAutos === 0}
                  style={btnPrimary(
                    submitting || availableAutos === 0 ? null : 'var(--amber)',
                    submitting || availableAutos === 0 ? null : 'rgba(245,166,35,0.35)',
                    submitting || availableAutos === 0
                  )}>
                  {submitting ? 'Joining…' : availableAutos === 0 ? 'No Autos Available' : '🛺  Join Queue'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grievance Modal */}
      {showGrievance && (
        <GrievanceModal
          backend={backend}
          studentToken={studentToken}
          recentTrips={state?.trips?.filter(t => t.student_id === decodeToken(studentToken)?.id) || []}
          onClose={() => setShowGrievance(false)}
        />
      )}
    </div>
  );
}

// ── Active Entry Card ─────────────────────────────────────────────────────────
function ActiveEntryCard({ entry, onCancel, cancelling, state }) {
  const position   = entry.position;
  const queueSize  = entry.queue_size;
  const isWaiting  = entry.status === 'waiting';
  const isDispatch = entry.status === 'dispatched';
  const isStarted  = entry.status === 'started';

  // Estimated wait: (position - 1) groups of 4 × avg trip time
  const estGroupsAhead = position > 1 ? Math.ceil((position - 1) / 4) : 0;
  const estWaitMin = estGroupsAhead * AVG_TRIP_MIN;

  const driver = state?.autos?.find(a => a.id === entry.auto_id);

  if (isStarted) {
    return (
      <div style={{ animation: 'float-up 0.4s ease both', marginBottom: 20 }}>
        <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.35)', borderRadius: 20, padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛺</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--green)', marginBottom: 6 }}>Journey Started</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>
            {entry.pickup} → {entry.dropoff}
          </div>
          {driver && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Driver: <strong style={{ color: 'var(--text)' }}>{driver.driver_name}</strong>
              {driver.vehicle_type === 'EV' && <span style={{ color: 'var(--green)', marginLeft: 6 }}>⚡ EV</span>}
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-faint)' }}>Sit back and enjoy the ride ✨</div>
        </div>
      </div>
    );
  }

  if (isDispatch) {
    return (
      <div style={{ animation: 'float-up 0.4s ease both', marginBottom: 20 }}>
        <div style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 20, padding: '20px' }}>
          <SectionLabel>DRIVER ASSIGNED</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderRadius: 14, background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.2)', marginBottom: 14 }}>
            <span style={{ fontSize: 28 }}>🛺</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)' }}>
                {driver ? driver.driver_name : 'Driver'} is on the way!
              </div>
              {driver?.vehicle_type === 'EV' && <span style={{ fontSize: 12, color: 'var(--green)' }}>⚡ Electric Vehicle</span>}
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
                {entry.pickup} → {entry.dropoff}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>Please wait at your pickup point. The driver will collect your group.</div>
          <button onClick={onCancel} disabled={cancelling} style={cancelBtn(cancelling)}>
            {cancelling ? 'Cancelling…' : '✕  Cancel Booking'}
          </button>
        </div>
      </div>
    );
  }

  // Waiting state
  return (
    <div style={{ animation: 'float-up 0.4s ease both', marginBottom: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '20px' }}>
        <SectionLabel>YOUR QUEUE POSITION</SectionLabel>

        {/* Position badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--amber-dim)', border: '2px solid var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--amber)', lineHeight: 1 }}>
              #{position || '—'}
            </span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {entry.pickup} → {entry.dropoff}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {queueSize > 1 ? `${queueSize} students waiting` : 'Only you in this queue'}
            </div>
          </div>
        </div>

        {/* Progress bar — fill towards 4 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
            <span>QUEUE FILL</span>
            <span>{Math.min(queueSize || 1, 4)}/4 students</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(((queueSize || 1) / 4) * 100, 100)}%`, background: 'var(--amber)', borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
            {queueSize >= 4 ? 'Auto dispatching soon…' : `${4 - (queueSize || 1)} more needed, or auto-sends in 5 min`}
          </div>
        </div>

        {/* Estimated wait */}
        {position !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
            <span>⏱</span>
            <span style={{ color: 'var(--text-dim)' }}>
              Estimated wait: <strong style={{ color: 'var(--text)' }}>
                {estWaitMin === 0 ? 'Next auto' : `~${estWaitMin} min`}
              </strong>
            </span>
          </div>
        )}

        <button onClick={onCancel} disabled={cancelling} style={cancelBtn(cancelling)}>
          {cancelling ? 'Leaving…' : '✕  Leave Queue'}
        </button>
      </div>
    </div>
  );
}

// ── Grievance Modal ───────────────────────────────────────────────────────────
function GrievanceModal({ backend, studentToken, recentTrips, onClose }) {
  const [category,    setCategory]    = useState('');
  const [description, setDescription] = useState('');
  const [tripId,      setTripId]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);

  const CATEGORIES = ['Driver behaviour', 'Vehicle condition', 'Long wait time', 'Route issue', 'Other'];

  const handleSubmit = async () => {
    if (!category)               return setError('Please select a category');
    if (description.trim().length < 10) return setError('Please describe the issue (min 10 characters)');
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${backend}/api/grievance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
        body: JSON.stringify({ category, description: description.trim(), trip_id: tripId || null }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not submit');
      else setDone(true);
    } catch { setError('Could not connect to server'); }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 0 0' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--surface)',
        borderRadius: '24px 24px 0 0', padding: '28px 24px 40px',
        border: '1px solid var(--border)', animation: 'float-up 0.3s ease both' }}>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>
              Report Submitted
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
              Your grievance has been sent to the admin. We'll look into it.
            </div>
            <button onClick={onClose} style={{ padding: '11px 28px', borderRadius: 10, border: 'none',
              background: 'var(--amber)', color: '#0a0a0f', fontFamily: 'var(--font-display)',
              fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>
                ⚠️ Report an Issue
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <Label>CATEGORY</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${category === c ? 'var(--red)' : 'var(--border)'}`,
                    background: category === c ? 'var(--red-dim)' : 'var(--bg3)',
                    color: category === c ? 'var(--red)' : 'var(--text-dim)',
                    fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
                  {c}
                </button>
              ))}
            </div>

            <Label>DESCRIPTION</Label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what happened…"
              rows={4}
              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg3)',
                border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)',
                fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
            />

            {recentTrips.length > 0 && (
              <>
                <Label>LINK TO A TRIP (OPTIONAL)</Label>
                <select value={tripId} onChange={e => setTripId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg3)',
                    border: '1px solid var(--border)', borderRadius: 10, color: tripId ? 'var(--text)' : 'var(--text-faint)',
                    fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', marginBottom: 16 }}>
                  <option value="">No specific trip</option>
                  {recentTrips.slice(0, 5).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.pickup} → {t.dropoff} · {new Date(t.completed_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </>
            )}

            {error && <div style={{ ...errBox, marginBottom: 14 }}>{error}</div>}

            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                background: submitting ? 'var(--surface2)' : 'var(--red)',
                color: submitting ? 'var(--text-faint)' : '#fff',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────
function btnPrimary(color, shadow, disabled = false) {
  return {
    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'var(--surface2)' : color,
    color: disabled ? 'var(--text-faint)' : '#0a0a0f',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
    letterSpacing: '0.5px', transition: 'all 0.2s',
    boxShadow: disabled ? 'none' : `0 4px 20px ${shadow}`,
  };
}

function cancelBtn(disabled) {
  return {
    width: '100%', padding: '11px', borderRadius: 10, border: '1px solid rgba(255,77,109,0.4)',
    background: 'var(--red-dim)', color: 'var(--red)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const btnSmall = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text-faint)', fontSize: 12,
  fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
};

const errBox = {
  padding: '10px 14px', borderRadius: 10, marginBottom: 14,
  background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)',
  fontSize: 13, color: 'var(--red)',
};

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-faint)', marginBottom: 12 }}>{children}</div>;
}

function Label({ children }) {
  return <label style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>{children}</label>;
}
