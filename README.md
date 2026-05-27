# CampusMove

Real-time queue management and dispatch system for campus E-Rickshaw services.

Built for Smart Campus Hackathon 2026 | SAU, New Delhi | Team Bytes

---

## Live Demo

| | URL |
|---|---|
| Frontend | https://campusmove-wd9m.vercel.app |
| Backend | *(Render backend URL)* |

---

## Features

**Student App**
- Live auto count at gate with radar animation
- Real-time ETA and demand status (Normal / Peak / Quiet)
- Interactive campus map with live auto positions (OpenStreetMap + Leaflet)
- Trip request with instant driver confirmation
- Geofence-based stop detection
- Grievance submission
- Offline fallback — shows last known state if server is unreachable

**Driver App** *(PIN protected)*
- View assigned trip groups
- Start and complete trips
- Live location updates

**Admin Panel** *(password protected)*
- AI demand forecast — 6-hour predicted trip volume chart
- Fleet management — toggle auto availability, view GPS positions
- Manual queue dispatch
- Driver PIN management
- Grievance resolution
- Full trip log with timestamps

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Leaflet, Socket.IO client, PWA |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL |
| Auth | JWT (student, driver, admin) |
| Deploy | Render (backend + DB), Vercel (frontend) |

---

## Deployment

### Backend (Render)
1. New Web Service → connect repo → set root directory to `backend`
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add a PostgreSQL database (free tier) → copy the internal database URL
5. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal DB URL from Render PostgreSQL |
| `JWT_SECRET` | Any random secret string |
| `ADMIN_PASSWORD` | Your chosen admin password |

### Frontend (Vercel)
1. New Project → connect repo → set root directory to `frontend`
2. Build command: `npm run build`
3. Output directory: `build`
4. Set environment variable:

| Variable | Value |
|---|---|
| `REACT_APP_BACKEND_URL` | Your Render backend URL |

---

## API Reference

### Auth
```
POST /api/auth/register        — { name, email, password } → student registration
POST /api/auth/login           — { email, password } → JWT token
POST /api/admin/login          — { password } → admin JWT token
POST /api/driver/login         — { driver_id, pin } → driver JWT token
```

### Student (requires student JWT)
```
POST /api/queue/join           — { pickup, dropoff } → join ride queue
POST /api/queue/:id/cancel     — cancel a queue entry
GET  /api/queue/my             — current queue status for student
POST /api/grievance            — { subject, description } → submit grievance
```

### Driver (requires driver JWT)
```
GET  /api/driver/dashboard     — assigned trips and status
POST /api/driver/trip/start    — start assigned trip
POST /api/driver/trip/complete — complete trip
POST /api/driver/location      — { lat, lng } → update live location
```

### Admin (requires admin JWT)
```
GET  /api/state                — full system state + forecast
GET  /api/forecast             — demand forecast only
GET  /api/drivers              — all drivers and status
GET  /api/routes               — valid pickup/dropoff combinations
GET  /api/trips                — full trip log
POST /api/admin/update         — { eta_minutes, peak_status }
POST /api/admin/auto/:id       — { status, location }
POST /api/admin/driver/:id/pin — set driver PIN
POST /api/admin/queue/dispatch — manually dispatch queue group
POST /api/admin/group/:group_id/complete — mark group trip complete
GET  /api/admin/grievances     — all grievances
POST /api/admin/grievance/:id/resolve — resolve a grievance
```

---

## Operating Hours

| Shift | Time |
|---|---|
| Morning | 8:30 AM – 10:30 AM |
| Evening | 3:30 PM – 6:00 PM |

Bookings outside these hours are disabled automatically.

---

## Campus Stops

| Stop | Coordinates |
|---|---|
| Main Gate 1 | 28.4815, 77.2016 |
| Main Gate 2 | 28.4840, 77.1984 |
| Rajpur Khurd Road | 28.4890, 77.1939 |
| Gaushala Road | 28.4833, 77.1889 |

---

<details>
<summary>Local Development Setup</summary>

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Database
```bash
psql -U postgres -c "CREATE DATABASE campusmove;"
```

### Backend
```bash
cd backend
npm install
node server.js
```
Runs at: `http://localhost:3001`

### Frontend
```bash
cd frontend
npm install
npm start
```
Opens at: `http://localhost:3000`

</details>

---

## Team

Team Bytes — South Asian University, New Delhi
