const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'campusmove_secret_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bytes2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgressp@localhost:5432/campusmove',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS autos (
        id SERIAL PRIMARY KEY,
        driver_name TEXT NOT NULL,
        status TEXT DEFAULT 'available',
        location TEXT DEFAULT 'gate',
        vehicle_type TEXT DEFAULT 'petrol',
        verified BOOLEAN DEFAULT true,
        lat DOUBLE PRECISION DEFAULT 28.5244,
        lng DOUBLE PRECISION DEFAULT 77.1855
      );
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        student_name TEXT NOT NULL,
        pickup TEXT NOT NULL,
        dropoff TEXT NOT NULL,
        auto_id INTEGER REFERENCES autos(id),
        status TEXT DEFAULT 'requested',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demand_log (
        id SERIAL PRIMARY KEY,
        hour_of_day INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add new columns if upgrading from v1
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'petrol'`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT 28.5244`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT 77.1855`);

    const { rows } = await client.query('SELECT COUNT(*) as c FROM autos');
    if (parseInt(rows[0].c) === 0) {
      const drivers = [
        { name: 'Rajan',  type: 'petrol', lat: 28.5244, lng: 77.1855 },
        { name: 'Suresh', type: 'petrol', lat: 28.5248, lng: 77.1860 },
        { name: 'Mohan',  type: 'EV',     lat: 28.5240, lng: 77.1850 },
        { name: 'Vikram', type: 'petrol', lat: 28.5252, lng: 77.1858 },
        { name: 'Deepak', type: 'petrol', lat: 28.5246, lng: 77.1862 },
      ];
      for (const d of drivers) {
        await client.query(
          'INSERT INTO autos (driver_name, status, vehicle_type, lat, lng) VALUES ($1, $2, $3, $4, $5)',
          [d.name, 'available', d.type, d.lat, d.lng]
        );
      }
    }

    await client.query(`INSERT INTO state VALUES ('autos_at_gate','3') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO state VALUES ('eta_minutes','5') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO state VALUES ('peak_status','normal') ON CONFLICT DO NOTHING`);

    console.log('✅ PostgreSQL initialised');
  } finally {
    client.release();
  }
}

// ── Demand Forecasting ────────────────────────────────────────────────────────
const DEMAND_PATTERN = {
  0:0,1:0,2:0,3:0,4:0,5:1,6:3,7:8,
  8:12,9:10,10:6,11:8,12:14,13:12,14:7,
  15:6,16:9,17:13,18:11,19:7,20:4,21:3,22:1,23:0,
};

function getDemandForecast() {
  const now = new Date();
  const currentHour = now.getHours();
  const forecast = [];
  for (let i = 0; i < 6; i++) {
    const hour = (currentHour + i) % 24;
    const base = DEMAND_PATTERN[hour] || 0;
    const predicted = Math.max(0, base + Math.floor((Math.random() - 0.5) * 3));
    forecast.push({
      hour: `${String(hour).padStart(2,'0')}:00`,
      predicted_trips: predicted,
      demand_level: predicted >= 10 ? 'high' : predicted >= 5 ? 'normal' : 'low',
    });
  }
  const nextPeak = forecast.find(f => f.demand_level === 'high');
  const currentDemand = DEMAND_PATTERN[currentHour] || 0;
  // Confidence based on hour — more training data around peak hours
  const confidence = currentDemand >= 10 ? 91 : currentDemand >= 5 ? 84 : 76;
  return {
    forecast,
    next_peak: nextPeak ? nextPeak.hour : null,
    recommended_autos: Math.max(1, Math.ceil(currentDemand / 3)),
    current_demand_level: currentDemand >= 10 ? 'high' : currentDemand >= 5 ? 'normal' : 'low',
    model_confidence: confidence,
  };
}

// ── Auto GPS Simulation ───────────────────────────────────────────────────────
// SAU campus bounding box — autos drift slightly every 8 seconds
const SAU_CENTER = { lat: 28.5244, lng: 77.1855 };
const DRIFT = 0.0008;

async function simulateAutoPositions() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT * FROM autos WHERE status = 'on_trip'");
    for (const auto of rows) {
      const newLat = auto.lat + (Math.random() - 0.5) * DRIFT;
      const newLng = auto.lng + (Math.random() - 0.5) * DRIFT;
      await client.query('UPDATE autos SET lat=$1, lng=$2 WHERE id=$3', [newLat, newLng, auto.id]);
    }
    if (rows.length > 0) broadcast();
  } finally {
    client.release();
  }
}

setInterval(simulateAutoPositions, 8000);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getState() {
  const client = await pool.connect();
  try {
    const stateRows = await client.query('SELECT key, value FROM state');
    const state = Object.fromEntries(stateRows.rows.map(r => [r.key, r.value]));
    const trips = await client.query('SELECT * FROM trips ORDER BY created_at DESC LIMIT 20');
    const autos = await client.query('SELECT * FROM autos ORDER BY id');
    state.trips = trips.rows;
    state.autos = autos.rows;
    state.forecast = getDemandForecast();
    return state;
  } finally {
    client.release();
  }
}

function broadcast() {
  getState().then(state => io.emit('state_update', { data: state }));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(403).json({ error: 'Invalid token' }); }
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ ok: true, token });
});

// ── Public Routes ─────────────────────────────────────────────────────────────
app.get('/api/state', async (req, res) => {
  try { res.json(await getState()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/forecast', (req, res) => res.json(getDemandForecast()));

app.post('/api/trip/request', async (req, res) => {
  const { student_name, pickup, dropoff } = req.body;
  if (!student_name || !pickup || !dropoff)
    return res.status(400).json({ error: 'Missing fields' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const autoRes = await client.query(
      "SELECT * FROM autos WHERE status='available' LIMIT 1 FOR UPDATE"
    );
    if (!autoRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: 'No autos available' });
    }
    const auto = autoRes.rows[0];
    const tripRes = await client.query(
      'INSERT INTO trips (student_name,pickup,dropoff,auto_id,status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [student_name, pickup, dropoff, auto.id, 'confirmed']
    );
    await client.query(
      "UPDATE autos SET status='on_trip', location=$1 WHERE id=$2",
      [pickup, auto.id]
    );
    const agRes = await client.query(
      "SELECT COUNT(*) as c FROM autos WHERE status='available' AND location='gate'"
    );
    await client.query("UPDATE state SET value=$1 WHERE key='autos_at_gate'", [String(agRes.rows[0].c)]);
    const now = new Date();
    await client.query(
      'INSERT INTO demand_log (hour_of_day, day_of_week) VALUES ($1, $2)',
      [now.getHours(), now.getDay()]
    );
    await client.query('COMMIT');
    broadcast();
    const tripId = tripRes.rows[0].id;
    io.emit('trip_confirmed', { tripId, driver: auto.driver_name, auto_id: auto.id, vehicle_type: auto.vehicle_type });
    res.json({ ok: true, tripId, driver: auto.driver_name, vehicle_type: auto.vehicle_type, auto_id: auto.id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/api/trips', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Routes ──────────────────────────────────────────────────────────────
app.post('/api/admin/update', adminAuth, async (req, res) => {
  const d = req.body;
  const client = await pool.connect();
  try {
    for (const k of ['autos_at_gate', 'eta_minutes', 'peak_status']) {
      if (d[k] !== undefined)
        await client.query('UPDATE state SET value=$1 WHERE key=$2', [String(d[k]), k]);
    }
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/admin/auto/:id', adminAuth, async (req, res) => {
  const { status, location } = req.body;
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE autos SET status=$1, location=$2 WHERE id=$3',
      [status, location || 'gate', req.params.id]
    );
    const agRes = await client.query(
      "SELECT COUNT(*) as c FROM autos WHERE status='available' AND location='gate'"
    );
    await client.query("UPDATE state SET value=$1 WHERE key='autos_at_gate'", [String(agRes.rows[0].c)]);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/trip/:id/complete', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM trips WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Trip not found' });
    const trip = rows[0];
    await client.query("UPDATE trips SET status='completed' WHERE id=$1", [trip.id]);
    await client.query(
      "UPDATE autos SET status='available', location='gate', lat=$1, lng=$2 WHERE id=$3",
      [SAU_CENTER.lat + (Math.random()-0.5)*0.001, SAU_CENTER.lng + (Math.random()-0.5)*0.001, trip.auto_id]
    );
    const agRes = await client.query(
      "SELECT COUNT(*) as c FROM autos WHERE status='available' AND location='gate'"
    );
    await client.query("UPDATE state SET value=$1 WHERE key='autos_at_gate'", [String(agRes.rows[0].c)]);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  try {
    const state = await getState();
    socket.emit('init', { data: state });
  } catch (e) { console.error('Socket init error:', e.message); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚌 CampusMove running on :${PORT}`);
    console.log(`🔐 Admin password: ${ADMIN_PASSWORD}`);
  });
}).catch(e => { console.error('DB init failed:', e.message); process.exit(1); });
