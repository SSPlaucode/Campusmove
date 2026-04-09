const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

// ── Stop coordinates ──────────────────────────────────────────────────────────
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

const AUTO_CAPACITY = 4;
const DISPATCH_TIMEOUT_MS = 5 * 60 * 1000;

// ── DB Init ───────────────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS autos (
        id SERIAL PRIMARY KEY,
        driver_name TEXT NOT NULL,
        status TEXT DEFAULT 'available',
        location TEXT DEFAULT 'gate',
        vehicle_type TEXT DEFAULT 'petrol',
        verified BOOLEAN DEFAULT true,
        lat DOUBLE PRECISION DEFAULT 28.4836,
        lng DOUBLE PRECISION DEFAULT 77.1950,
        driver_pin TEXT DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS queue_entries (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id),
        student_name TEXT NOT NULL,
        pickup TEXT NOT NULL,
        dropoff TEXT NOT NULL,
        status TEXT DEFAULT 'waiting',
        auto_id INTEGER REFERENCES autos(id),
        group_id TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        dispatched_at TIMESTAMPTZ DEFAULT NULL,
        started_at TIMESTAMPTZ DEFAULT NULL,
        completed_at TIMESTAMPTZ DEFAULT NULL
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

    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'petrol'`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT 28.4836`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT 77.1950`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS driver_pin TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE autos ADD COLUMN IF NOT EXISTS ev_schedule_override BOOLEAN DEFAULT false`);

    const { rows } = await client.query('SELECT COUNT(*) as c FROM autos');
    if (parseInt(rows[0].c) === 0) {
      const drivers = [
        { name: 'Rajan',  type: 'petrol', lat: 28.4815, lng: 77.2016, pin: '1234' },
        { name: 'Suresh', type: 'petrol', lat: 28.4840, lng: 77.1984, pin: '2345' },
        { name: 'Mohan',  type: 'EV',     lat: 28.4890, lng: 77.1939, pin: '3456' },
        { name: 'Vikram', type: 'petrol', lat: 28.4833, lng: 77.1889, pin: '4567' },
        { name: 'Deepak', type: 'petrol', lat: 28.4820, lng: 77.1960, pin: '5678' },
      ];
      for (const d of drivers) {
        const pinHash = await bcrypt.hash(d.pin, 10);
        await client.query(
          'INSERT INTO autos (driver_name, status, vehicle_type, lat, lng, driver_pin) VALUES ($1,$2,$3,$4,$5,$6)',
          [d.name, 'available', d.type, d.lat, d.lng, pinHash]
        );
      }
      console.log('Drivers seeded — Rajan:1234 Suresh:2345 Mohan:3456 Vikram:4567 Deepak:5678');
    }

    await client.query(`INSERT INTO state VALUES ('eta_minutes','8') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO state VALUES ('peak_status','normal') ON CONFLICT DO NOTHING`);
    console.log('PostgreSQL initialised');
  } finally {
    client.release();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function generateGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
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
  const confidence = currentDemand >= 10 ? 91 : currentDemand >= 5 ? 84 : 76;
  return {
    forecast,
    next_peak: nextPeak ? nextPeak.hour : null,
    recommended_autos: Math.max(1, Math.ceil(currentDemand / 3)),
    current_demand_level: currentDemand >= 10 ? 'high' : currentDemand >= 5 ? 'normal' : 'low',
    model_confidence: confidence,
  };
}

// ── GPS Simulation ────────────────────────────────────────────────────────────
async function simulateAutoPositions() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT * FROM autos WHERE status = 'on_trip'");
    for (const auto of rows) {
      const newLat = auto.lat + (Math.random() - 0.5) * 0.0006;
      const newLng = auto.lng + (Math.random() - 0.5) * 0.0006;
      await client.query('UPDATE autos SET lat=$1, lng=$2 WHERE id=$3', [newLat, newLng, auto.id]);
    }
    if (rows.length > 0) broadcast();
  } finally {
    client.release();
  }
}
setInterval(simulateAutoPositions, 8000);

// ── EV Schedule Job ───────────────────────────────────────────────────────────
// EV autos run: 08:30–10:30 and 15:30–18:00 (IST)
// ev_schedule_override = true means admin has manually toggled → skip auto logic
function isEVOperatingHour() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset - (now.getTimezoneOffset() * 60000));
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  return (mins >= 8*60+30 && mins < 10*60+30) || (mins >= 15*60+30 && mins < 18*60);
}

async function runEVScheduleJob() {
  const client = await pool.connect();
  try {
    const shouldBeAvailable = isEVOperatingHour();
    // Only touch EV autos that are NOT overridden by admin and NOT currently on a trip
    const { rows: evAutos } = await client.query(
      `SELECT * FROM autos WHERE vehicle_type='EV' AND ev_schedule_override=false AND status != 'on_trip'`
    );
    let changed = false;
    for (const auto of evAutos) {
      if (shouldBeAvailable && auto.status === 'offline') {
        await client.query(`UPDATE autos SET status='available' WHERE id=$1`, [auto.id]);
        console.log(`EV schedule: ${auto.driver_name} → available`);
        changed = true;
      } else if (!shouldBeAvailable && auto.status === 'available') {
        await client.query(`UPDATE autos SET status='offline' WHERE id=$1`, [auto.id]);
        console.log(`EV schedule: ${auto.driver_name} → offline`);
        changed = true;
      }
    }
    if (changed) broadcast();
  } catch (e) {
    console.error('EV schedule error:', e.message);
  } finally {
    client.release();
  }
}
setInterval(runEVScheduleJob, 60000); // check every minute

// ── Auto Peak Status ──────────────────────────────────────────────────────────
// Derives peak_status from forecast so admin doesn't need to set it manually
function getAutoPeakStatus() {
  const now = new Date();
  const hour = now.getHours();
  const demand = DEMAND_PATTERN[hour] || 0;
  if (demand >= 10) return 'high';
  if (demand >= 5)  return 'normal';
  return 'low';
}

// ── Dispatch Job ──────────────────────────────────────────────────────────────
async function runDispatchJob() {
  const client = await pool.connect();
  try {
    for (const route of VALID_ROUTES) {
      const { pickup, dropoff } = route;

      const { rows: waiting } = await client.query(
        `SELECT * FROM queue_entries
         WHERE pickup=$1 AND dropoff=$2 AND status='waiting'
         ORDER BY created_at ASC`,
        [pickup, dropoff]
      );

      if (waiting.length === 0) continue;

      const oldest = waiting[0];
      const waitMs = Date.now() - new Date(oldest.created_at).getTime();
      const shouldDispatch = waiting.length >= AUTO_CAPACITY || waitMs >= DISPATCH_TIMEOUT_MS;
      if (!shouldDispatch) continue;

      const stopCoords = STOPS[pickup];
      const { rows: available } = await client.query("SELECT * FROM autos WHERE status='available'");
      if (available.length === 0) continue;

      let closest = null, minDist = Infinity;
      for (const auto of available) {
        const d = haversineDistance(auto.lat, auto.lng, stopCoords.lat, stopCoords.lng);
        if (d < minDist) { minDist = d; closest = auto; }
      }
      if (!closest) continue;

      const group = waiting.slice(0, AUTO_CAPACITY);
      const groupId = generateGroupId();
      const now = new Date();

      await client.query('BEGIN');
      try {
        await client.query("UPDATE autos SET status='on_trip', location=$1 WHERE id=$2", [pickup, closest.id]);
        for (const entry of group) {
          await client.query(
            `UPDATE queue_entries SET status='dispatched', auto_id=$1, group_id=$2, dispatched_at=$3 WHERE id=$4`,
            [closest.id, groupId, now, entry.id]
          );
        }
        await client.query('INSERT INTO demand_log (hour_of_day, day_of_week) VALUES ($1,$2)', [now.getHours(), now.getDay()]);
        await client.query('COMMIT');

        console.log(`Dispatched ${closest.driver_name} -> ${pickup}->${dropoff} (${group.length} students)`);
        broadcast();
        io.emit('group_dispatched', {
          groupId, driver: closest.driver_name, vehicle_type: closest.vehicle_type,
          auto_id: closest.id, pickup, dropoff,
          student_ids: group.map(e => e.student_id),
          entry_ids: group.map(e => e.id),
        });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('Dispatch error:', e.message);
      }
    }
  } catch (e) {
    console.error('Dispatch job error:', e.message);
  } finally {
    client.release();
  }
}
setInterval(runDispatchJob, 30000);

// ── State ─────────────────────────────────────────────────────────────────────
async function getState() {
  const client = await pool.connect();
  try {
    const stateRows = await client.query('SELECT key, value FROM state');
    const state = Object.fromEntries(stateRows.rows.map(r => [r.key, r.value]));

    const autos = await client.query('SELECT id, driver_name, status, location, vehicle_type, verified, lat, lng FROM autos ORDER BY id');

    const queueRows = await client.query(
      `SELECT id, student_id, student_name, pickup, dropoff, status, auto_id, group_id, created_at, dispatched_at, started_at
       FROM queue_entries WHERE status IN ('waiting','dispatched','started')
       ORDER BY pickup, dropoff, created_at ASC`
    );

    const queues = {};
    for (const route of VALID_ROUTES) {
      queues[`${route.pickup}|${route.dropoff}`] = [];
    }
    for (const row of queueRows.rows) {
      const key = `${row.pickup}|${row.dropoff}`;
      if (queues[key] !== undefined) queues[key].push(row);
    }

    const { rows: availRows } = await client.query("SELECT COUNT(*) as c FROM autos WHERE status='available'");
    const trips = await client.query(`SELECT * FROM queue_entries WHERE status='completed' ORDER BY completed_at DESC LIMIT 30`);

    state.autos = autos.rows;
    state.queues = queues;
    state.available_autos = parseInt(availRows[0].c);
    state.forecast = getDemandForecast();
    state.trips = trips.rows;
    // Always derive peak_status from forecast — admin setting ignored
    state.peak_status = getAutoPeakStatus();
    return state;
  } finally {
    client.release();
  }
}

function broadcast() {
  getState().then(state => io.emit('state_update', { data: state })).catch(console.error);
}

// ── Middleware ────────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Not an admin' });
    req.admin = payload; next();
  } catch { res.status(403).json({ error: 'Invalid or expired token' }); }
}

function studentAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Please log in to book a ride' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'student') return res.status(403).json({ error: 'Not a student account' });
    req.student = payload; next();
  } catch { res.status(403).json({ error: 'Invalid or expired token — please log in again' }); }
}

function driverAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Driver auth required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'driver') return res.status(403).json({ error: 'Not a driver account' });
    req.driver = payload; next();
  } catch { res.status(403).json({ error: 'Invalid or expired token' }); }
}

// ── Student Auth ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'All fields are required' });
  const emailLower = email.toLowerCase();
  const validDomain = emailLower.endsWith('@sau.int') || emailLower.endsWith('@student.sau.int')
    || emailLower.endsWith('@students.sau.ac.in') || emailLower.endsWith('@sau.ac.in');
  if (!validDomain) return res.status(400).json({ error: 'Please use your SAU email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email',
      [name.trim(), email.toLowerCase().trim(), hash]
    );
    const user = rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, name: user.name, email: user.email });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (!rows.length) return res.status(401).json({ error: 'No account found with this email' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, name: user.name, email: user.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Auth ────────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ ok: true, token });
});

// ── Driver Auth ───────────────────────────────────────────────────────────────
app.post('/api/driver/login', async (req, res) => {
  const { driver_id, pin } = req.body;
  if (!driver_id || !pin) return res.status(400).json({ error: 'Driver ID and PIN required' });
  try {
    const { rows } = await pool.query('SELECT * FROM autos WHERE id=$1', [driver_id]);
    if (!rows.length) return res.status(401).json({ error: 'Driver not found' });
    const driver = rows[0];
    if (!driver.driver_pin) return res.status(401).json({ error: 'No PIN set — ask admin to configure it' });
    const match = await bcrypt.compare(String(pin), driver.driver_pin);
    if (!match) return res.status(401).json({ error: 'Incorrect PIN' });
    const token = jwt.sign({ id: driver.id, name: driver.driver_name, role: 'driver' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ ok: true, token, name: driver.driver_name, driver_id: driver.id, vehicle_type: driver.vehicle_type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/drivers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, driver_name, vehicle_type, verified FROM autos ORDER BY id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Public ────────────────────────────────────────────────────────────────────
app.get('/api/state', async (req, res) => {
  try { res.json(await getState()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/forecast', (req, res) => res.json(getDemandForecast()));
app.get('/api/routes', (req, res) => res.json(VALID_ROUTES));

// ── Queue — join ──────────────────────────────────────────────────────────────
app.post('/api/queue/join', studentAuth, async (req, res) => {
  const { pickup, dropoff } = req.body;
  const { name: student_name, id: student_id } = req.student;

  if (!pickup || !dropoff) return res.status(400).json({ error: 'Select pickup and drop-off' });
  if (!VALID_ROUTES.find(r => r.pickup === pickup && r.dropoff === dropoff))
    return res.status(400).json({ error: 'Invalid route combination' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: active } = await client.query(
      `SELECT id FROM queue_entries WHERE student_id=$1 AND status IN ('waiting','dispatched','started')`,
      [student_id]
    );
    if (active.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active booking. Cancel it first.' });
    }

    const { rows } = await client.query(
      `INSERT INTO queue_entries (student_id, student_name, pickup, dropoff, status) VALUES ($1,$2,$3,$4,'waiting') RETURNING *`,
      [student_id, student_name, pickup, dropoff]
    );
    const entry = rows[0];

    const { rows: pos } = await client.query(
      `SELECT COUNT(*) as c FROM queue_entries WHERE pickup=$1 AND dropoff=$2 AND status='waiting' AND created_at <= $3`,
      [pickup, dropoff, entry.created_at]
    );

    await client.query('COMMIT');
    broadcast();
    // Immediately try to dispatch in case we just hit capacity
    setTimeout(runDispatchJob, 500);
    res.json({ ok: true, entry_id: entry.id, position: parseInt(pos[0].c) });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── Queue — cancel ────────────────────────────────────────────────────────────
app.post('/api/queue/:id/cancel', studentAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM queue_entries WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    const entry = rows[0];
    if (entry.student_id !== req.student.id) return res.status(403).json({ error: 'You can only cancel your own booking' });
    if (!['waiting', 'dispatched'].includes(entry.status)) return res.status(400).json({ error: 'Cannot cancel at this stage' });

    await client.query("UPDATE queue_entries SET status='cancelled' WHERE id=$1", [entry.id]);

    if (entry.status === 'dispatched' && entry.group_id && entry.auto_id) {
      const { rows: remaining } = await client.query(
        `SELECT COUNT(*) as c FROM queue_entries WHERE group_id=$1 AND status='dispatched'`,
        [entry.group_id]
      );
      if (parseInt(remaining[0].c) === 0) {
        await client.query("UPDATE autos SET status='available', location='gate' WHERE id=$1", [entry.auto_id]);
      }
    }

    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── Queue — student's own entry ───────────────────────────────────────────────
app.get('/api/queue/my', studentAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT qe.*, a.driver_name, a.vehicle_type
       FROM queue_entries qe LEFT JOIN autos a ON qe.auto_id = a.id
       WHERE qe.student_id=$1 AND qe.status IN ('waiting','dispatched','started')
       ORDER BY qe.created_at DESC LIMIT 1`,
      [req.student.id]
    );
    if (!rows.length) return res.json({ entry: null });
    const entry = rows[0];
    let position = null, queue_size = null;
    if (entry.status === 'waiting') {
      const { rows: pos } = await pool.query(
        `SELECT COUNT(*) as c FROM queue_entries WHERE pickup=$1 AND dropoff=$2 AND status='waiting' AND created_at <= $3`,
        [entry.pickup, entry.dropoff, entry.created_at]
      );
      const { rows: total } = await pool.query(
        `SELECT COUNT(*) as c FROM queue_entries WHERE pickup=$1 AND dropoff=$2 AND status='waiting'`,
        [entry.pickup, entry.dropoff]
      );
      position = parseInt(pos[0].c);
      queue_size = parseInt(total[0].c);
    }
    res.json({ entry: { ...entry, position, queue_size } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Driver Routes ─────────────────────────────────────────────────────────────
app.get('/api/driver/dashboard', driverAuth, async (req, res) => {
  try {
    const { rows: autoRows } = await pool.query('SELECT * FROM autos WHERE id=$1', [req.driver.id]);
    if (!autoRows.length) return res.status(404).json({ error: 'Driver not found' });
    const { rows: group } = await pool.query(
      `SELECT * FROM queue_entries WHERE auto_id=$1 AND status IN ('dispatched','started') ORDER BY created_at ASC`,
      [req.driver.id]
    );
    res.json({ driver: autoRows[0], group });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/driver/trip/start', driverAuth, async (req, res) => {
  const { group_id } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id required' });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM queue_entries WHERE group_id=$1 AND status='dispatched'`, [group_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Group not found or already started' });
    if (rows[0].auto_id !== req.driver.id) return res.status(403).json({ error: 'Not your group' });
    await client.query(
      `UPDATE queue_entries SET status='started', started_at=$1 WHERE group_id=$2 AND status='dispatched'`,
      [new Date(), group_id]
    );
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/driver/trip/complete', driverAuth, async (req, res) => {
  const { group_id } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id required' });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM queue_entries WHERE group_id=$1 AND status='started'`, [group_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No started trip found' });
    if (rows[0].auto_id !== req.driver.id) return res.status(403).json({ error: 'Not your group' });
    const now = new Date();
    await client.query(`UPDATE queue_entries SET status='completed', completed_at=$1 WHERE group_id=$2`, [now, group_id]);
    await client.query(
      "UPDATE autos SET status='available', location='gate', lat=$1, lng=$2 WHERE id=$3",
      [28.4836 + (Math.random()-0.5)*0.002, 77.1950 + (Math.random()-0.5)*0.002, req.driver.id]
    );
    broadcast();
    io.emit('trip_completed', { group_id, driver_id: req.driver.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── Admin Routes ──────────────────────────────────────────────────────────────
app.post('/api/admin/update', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    for (const k of ['eta_minutes', 'peak_status']) {
      if (req.body[k] !== undefined)
        await client.query('UPDATE state SET value=$1 WHERE key=$2', [String(req.body[k]), k]);
    }
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/admin/auto/:id', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM autos WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Auto not found' });
    if (rows[0].status === 'on_trip' && req.body.status === 'available') {
      const { rows: active } = await client.query(
        "SELECT id FROM queue_entries WHERE auto_id=$1 AND status IN ('dispatched','started') LIMIT 1",
        [req.params.id]
      );
      if (active.length > 0)
        return res.status(409).json({ error: 'Cannot free this auto — it has an active trip' });
    }
    await client.query('UPDATE autos SET status=$1, location=$2, ev_schedule_override=CASE WHEN vehicle_type=\'EV\' THEN true ELSE ev_schedule_override END WHERE id=$3',
      [req.body.status, req.body.location || 'gate', req.params.id]);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/admin/driver/:id/pin', adminAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  try {
    const hash = await bcrypt.hash(String(pin), 10);
    await pool.query('UPDATE autos SET driver_pin=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/group/:group_id/complete', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM queue_entries WHERE group_id=$1 AND status IN ('dispatched','started') LIMIT 1`,
      [req.params.group_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    const now = new Date();
    await client.query(`UPDATE queue_entries SET status='completed', completed_at=$1 WHERE group_id=$2`, [now, req.params.group_id]);
    if (rows[0].auto_id) {
      await client.query("UPDATE autos SET status='available', location='gate' WHERE id=$1", [rows[0].auto_id]);
    }
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/admin/queue/dispatch', adminAuth, async (req, res) => {
  await runDispatchJob();
  res.json({ ok: true });
});

app.get('/api/trips', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM queue_entries WHERE status='completed' ORDER BY completed_at DESC LIMIT 50`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    console.log(`CampusMove v4 running on :${PORT}`);
    setTimeout(runDispatchJob, 5000);
  });
}).catch(e => { console.error('DB init failed:', e.message); process.exit(1); });
