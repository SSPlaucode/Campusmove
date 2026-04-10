# CampusMove

Real-time visibility and smart optimization for free campus last-mile transport.

Built for Smart Campus Hackathon 2026 | SAU, New Delhi | Team Bytes

---

## Features

**Student App**
- Live auto count at gate with radar animation
- Real-time ETA and demand status (Normal / Peak / Quiet)
- Interactive campus map with live auto positions (OpenStreetMap + Leaflet)
- Trip request with instant driver confirmation
- Push notifications on booking
- Offline fallback — shows last known state if server is unreachable

**Admin Panel** *(password protected)*
- AI demand forecast — 6-hour predicted trip volume chart
- Fleet management — toggle auto availability, view GPS positions
- ETA and demand status controls
- Active trip management and completion
- Full trip log with timestamps

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Leaflet, Socket.IO client, PWA |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL |
| Auth | JWT |
| Deploy | Render (backend + DB), Vercel (frontend) |

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

---

## Local Setup

**1. Database**
```bash
psql -U postgres -c "CREATE DATABASE campusmove;"
```

**2. Backend**
```bash
cd backend
npm install
node server.js
```

Runs at: `https://campusmove.onrender.com`

**3. Frontend**
```bash
cd frontend
npm install
npm start
```

Opens at: `http://localhost:3000`

Admin password: `bytes2026`

---

## Deployment

### Backend (Render)
1. New Web Service → connect repo → set root directory to `backend`
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add a PostgreSQL database (free tier) → copy the internal database URL
5. Environment variables:
   - `DATABASE_URL` — from Render PostgreSQL
   - `ADMIN_PASSWORD` — your chosen password
   - `JWT_SECRET` — any random string

### Frontend (Vercel)
1. New Project → connect repo → set root directory to `frontend`
2. Build command: `npm run build`
3. Output directory: `build`
4. Environment variable:
   - `REACT_APP_BACKEND_URL` — your Render backend URL

---

## API Reference

```
GET  /api/state               — Full system state + forecast
GET  /api/forecast            — Demand forecast only
POST /api/admin/login         — { password } → JWT token
POST /api/trip/request        — { student_name, pickup, dropoff }
POST /api/trip/:id/complete   — (admin) Mark trip complete
POST /api/admin/update        — (admin) { eta_minutes, peak_status }
POST /api/admin/auto/:id      — (admin) { status, location }
GET  /api/trips               — All trip logs
```

---

## Team

Team Bytes — South Asian University, New Delhi
