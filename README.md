# CampusMove v3 — Setup Guide
Smart Campus Hackathon 2026 | Team Bytes | Problem Statement G

## What's new in v3
- Socket.IO real-time (replaced polling)
- OpenStreetMap with SAU campus coordinates + live auto positions
- Auto GPS simulation (on-trip autos drift every 8s)
- Browser push notifications on booking
- Offline fallback with localStorage cache + banner
- Timestamps on all trips
- Driver name + auto ID + vehicle type shown after booking
- EV badge on Mohan's auto (vehicle_type column)
- Verified ✓ badge on all drivers
- Model confidence % on demand forecast
- Fixed handleLogin crash bug (function now above early return)
- GPS coordinates shown in admin fleet view

---

## Prerequisites
- Node.js 18+
- PostgreSQL 14+ (local) OR use Render's free Postgres

## Backend Setup

```bash
cd backend
npm install

# Local Postgres:
createdb campusmove
DATABASE_URL=postgresql://localhost:5432/campusmove node server.js

# With Render Postgres (get URL from Render dashboard):
DATABASE_URL=postgresql://... node server.js
```

Runs on: http://localhost:3001
Admin password: bytes2026

## Frontend Setup

```bash
cd frontend
npm install
REACT_APP_BACKEND_URL=http://localhost:3001 npm start
```

Opens at: http://localhost:3000

---

## Deploy on Render + Vercel

### Backend (Render)
1. Push to GitHub
2. New Web Service → /backend folder
3. Build: `npm install`
4. Start: `node server.js`
5. Add Postgres database (free tier) → copy DATABASE_URL
6. Environment variables:
   - DATABASE_URL = (from Render Postgres)
   - JWT_SECRET = any random string
   - ADMIN_PASSWORD = bytes2026

### Frontend (Vercel)
1. New Project → /frontend folder
2. Build: `npm run build`
3. Output: `build`
4. Environment variable:
   - REACT_APP_BACKEND_URL = https://your-backend.onrender.com

---

## Demo Script (under 2 minutes)

1. Open student view on phone → show radar animation + map
2. Request a ride → push notification fires → confirmation shows driver name + auto ID
3. Switch to admin → show demand forecast with confidence %
4. Toggle an auto → count drops live on student view (Socket.IO, no refresh)
5. Point out EV badge on Mohan, verified ✓ on all drivers
6. Complete a trip → auto returns to fleet on map
7. Show trip log with timestamps

---

## Judge Q&A

**Why not WhatsApp?**
No accountability trail, no demand data, no real-time visibility, driver can ghost

**How does it scale?**
Stateless Node.js backend, Postgres handles concurrent writes with transaction locks (FOR UPDATE), Render scales horizontally

**What if server goes down?**
Offline banner appears, last known state served from localStorage cache

**How accurate is the demand forecast?**
Pattern-based baseline now, 84-91% confidence. Every trip logs to demand_log — with 2 weeks of real data this feeds a real LSTM pipeline

**What's EV expansion ready mean?**
vehicle_type column already in schema, EV autos render differently in fleet and on map. Adding EV-specific routing is a config change

---

## API Reference

GET  /api/state                — Full system state + forecast
GET  /api/forecast             — Demand forecast only
POST /api/admin/login          — { password } → JWT token
POST /api/trip/request         — { student_name, pickup, dropoff }
POST /api/trip/:id/complete    — (admin auth) Mark trip complete
POST /api/admin/update         — (admin auth) { eta_minutes, peak_status }
POST /api/admin/auto/:id       — (admin auth) { status, location }
GET  /api/trips                — All trip logs

## Tech Stack
Backend:  Node.js · Express · Socket.IO · PostgreSQL · JWT
Frontend: React 18 · Leaflet · Socket.IO client · PWA · CSS Variables
Deploy:   Render (backend + DB) · Vercel (frontend)
