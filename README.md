# Revamp ELB Logbook UX

Electronic Logbook (ELB) for property-carrying CMV drivers — route planning, daily duty-status logs, and FMCSA-style log sheets. UX revamp of the original Figma design at https://www.figma.com/design/uBvzIcaWsBsNupH1YjGSgD/Revamp-ELB-Logbook-UX.

Full-stack:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Radix + Leaflet
- **Backend**: Django 6 + Django Ninja (REST) + SQLite

---

## Features

- **Trip planning** — geocoded current/pickup/dropoff with route geometry, distance, driving hours, fuel-stop estimation.
- **Daily logs** — per-day duty segments (off duty / sleeper / driving / on duty), location + remarks, total driving + on-duty minutes auto-computed.
- **Editable today's log** — with ±1 day window for timezone skew.
- **Pagination** — paged log list with page-size selector.
- **Backdated seed data** — every new signup auto-gets 10 randomized historical logs with realistic carrier, cities, highways, truck stops, and remarks.
- **Session auth** — Django session login/logout with cookie-based API requests.

---

## Repo layout

```
.
├── README.md
├── uv.lock
└── src/
    ├── backend/                       # Django + Ninja API
    │   ├── manage.py
    │   ├── pyproject.toml             # uv-managed deps
    │   ├── config/
    │   │   ├── settings.py            # Django settings (TIME_ZONE=UTC, USE_TZ=True)
    │   │   ├── urls.py                # mounts /api → NinjaAPI
    │   │   ├── api.py                 # NinjaAPI root + router mounts
    │   │   ├── asgi.py / wsgi.py
    │   └── apps/
    │       ├── accounts/              # users and session auth
    │       │   ├── models.py          # User
    │       │   ├── api.py             # /auth/register, /login, /logout, /me
    │       │   └── schemas.py
    │       ├── trips/                 # trip planning persistence
    │       │   ├── models.py          # Trip
    │       │   ├── api.py             # CRUD /trips
    │       │   └── schemas.py
    │       └── logs/                  # daily logs + duty segments
    │           ├── models.py          # DailyLog, DutySegment
    │           ├── api.py             # /logs CRUD + pagination + segments
    │           ├── schemas.py         # DailyLogIn/Out/Patch, PaginatedDailyLogs
    │           ├── seeders.py         # seed_backdated_logs()
    │           └── management/commands/
    │               └── seed_user_logs.py
    └── frontend/                      # React + Vite SPA
        ├── package.json
        ├── vite.config.ts
        ├── default_shadcn_theme.css
        ├── index.html
        └── src/
            ├── main.tsx
            ├── styles/
            └── app/
                ├── App.tsx
                ├── config.ts          # VITE_API_URL
                ├── services/
                │   ├── api.ts         # typed fetch client (auth, trips, logs)
                │   └── routing.ts     # geocode + route fetch
                └── components/
                    ├── LogbookEntry.tsx   # main logbook view + pagination
                    ├── LoginForm.tsx
                    ├── DutyTimeline.tsx
                    ├── SegmentEditor.tsx
                    ├── RouteMap.tsx       # Leaflet map
                    ├── LocationAutocomplete.tsx
                    ├── logbook-utils.ts
                    └── ui/                # shadcn-style primitives
```

---

## Local setup

### Docker Compose

Requires Docker Desktop or Docker Engine with Compose.

```bash
docker compose up --build
```

Services:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- Postgres: localhost:5432 (`spotter` / `spotter` / `spotter`)

The backend container waits for Postgres, runs `python manage.py migrate --noinput`, then starts Django on `0.0.0.0:8000`.

Useful commands:
```bash
docker compose down
docker compose down -v   # also removes the Postgres volume
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_user_logs <username>
```

### Backend

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd src/backend
uv sync                                # install deps into .venv
uv run python manage.py migrate
uv run python manage.py runserver      # http://localhost:8000
```

Optional admin:
```bash
uv run python manage.py createsuperuser
```

### Frontend

Requires Node 18+ and pnpm.

```bash
cd src/frontend
pnpm install
pnpm dev                               # http://localhost:5173
```

Set `VITE_API_URL` if backend is not at `http://localhost:8000`:
```bash
echo "VITE_API_URL=http://localhost:8000" > src/frontend/.env.local
```

---

## Auth

Django session authentication is used through `django.contrib.auth` and Ninja's `django_auth`.

Flow:
1. `POST /api/auth/register` → creates `User`, calls Django `login()`, **also runs `seed_backdated_logs(user, count=10, start_offset=1)`** to populate demo history.
2. `POST /api/auth/login` → authenticates credentials and calls Django `login()`.
3. Frontend sends API requests with `credentials: 'include'` so the browser carries the session cookie.
4. All `/trips/*` and `/logs/*` requests require an authenticated Django session.
5. `POST /api/auth/logout` calls Django `logout()` and clears the session.

---

## Seeding

Two paths:

**Automatic on signup** — `apps/accounts/api.py:register` calls `seed_backdated_logs(user, count=10, start_offset=1)` immediately after user creation. New users land in the app with 10 days of demo history.

**Manual via management command**:
```bash
cd src/backend
uv run python manage.py seed_user_logs <username> [--count 10] [--start-offset 1] [--seed 42]
```

Seeder behavior (`apps/logs/seeders.py`):
- Dates: `today - start_offset` going back `count` days.
- Skips dates that already have a log (UniqueConstraint `unique_user_log_date`).
- Per-batch constants: carrier, truck #, trailer # (consistent driver).
- Per-day randomized: from/to cities (sampled from 13 US cities), miles_today (280–820).
- Segments randomized within FMCSA-ish bounds: sleeper 7–9h, driving 6–11h, on-duty 1–3h, off-duty fills remainder. Always sums to 1440 min.
- Per-segment `location` + `notes`:
  - driving → `I-40 W (Dallas, TX → Phoenix, AZ)` + "Linehaul driving"/"Highway run"/…
  - on_duty → city + "Pre-trip inspection"/"Loading"/…
  - off_duty/sleeper → truck stop + city + "Off duty"/"Sleeper berth"/…
- `--seed N` makes runs deterministic (tests).

---

## API surface

Mounted under `/api` (`config/api.py`).

### Auth — `/api/auth`
| Method | Path        | Auth   | Returns          |
|--------|-------------|--------|------------------|
| POST   | `/register` | none   | `AuthOut` (201)  |
| POST   | `/login`    | none   | `AuthOut`        |
| POST   | `/logout`   | session | 204             |
| GET    | `/me`       | session | `UserOut`       |

### Trips — `/api/trips`
Full CRUD: `GET /`, `POST /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`. Scoped to `request.auth`.

### Logs — `/api/logs`
| Method | Path                | Notes                                                                 |
|--------|---------------------|-----------------------------------------------------------------------|
| GET    | `/`                 | Paginated: `?page=1&page_size=20&date_from=&date_to=&trip_id=`        |
| GET    | `/today`            | Today's log (404 if none)                                             |
| POST   | `/`                 | Create log for date (rejects duplicates)                              |
| GET    | `/{id}`             | Single log + segments                                                 |
| PATCH  | `/{id}`             | Edit fields; gated by `_is_editable` (today ±1 day for TZ skew)       |
| DELETE | `/{id}`             | Same editability gate                                                 |
| PUT    | `/{id}/segments`    | Replace all duty segments; recomputes `total_driving/on_duty_minutes` |

Pagination response shape:
```json
{ "items": [...], "total": 42, "page": 1, "page_size": 20, "has_next": true }
```

---

## Editability rule

`apps/logs/api.py:_is_editable` returns true when `abs(log.log_date - date.today()) <= 1`. The ±1 window absorbs client/server timezone skew (server runs `TIME_ZONE=UTC`; frontend sends `log_date` based on browser TZ). Applies to PATCH `/logs/{id}`, DELETE `/logs/{id}`, PUT `/logs/{id}/segments`.

---

## Models

**DailyLog** (`apps/logs/models.py`)
- `user` (FK), `trip` (FK nullable), `log_date` (unique per user)
- Trip header: from/to_location, truck/trailer_number, carrier_name
- Mileage: miles_today, total_mileage
- Addresses: main_office_address, home_terminal_address
- Totals: total_driving_minutes, total_on_duty_minutes (auto-recomputed)

**DutySegment**
- `daily_log` (FK), `type` ∈ {off_duty, sleeper, driving, on_duty}
- `start_minute`, `end_minute` ∈ [0, 1440]; check constraints enforce ordering + bounds
- `location`, `notes`

**Trip** — `apps/trips/models.py` — geocoded route inputs + computed plan.

**User** — `apps/accounts/models.py` — custom user model.

---

## Frontend notes

- **API client**: `src/app/services/api.ts` — `api.auth.*`, `api.trips.*`, `api.logs.*`. Sends cookies with `credentials: 'include'`. Throws `ApiError(status, message, body)` on non-2xx.
- **Routing/geocoding**: `src/app/services/routing.ts` — external geocoder + route fetch (Leaflet for rendering).
- **Logbook view**: `LogbookEntry.tsx` — list + expandable log cards, paginated (default 5/page, selector for 5/10/20/50), inline editing for today's log, debounced PATCH via `patchTimers`.
- **Styling**: Tailwind v4 + shadcn-style primitives in `components/ui/`; theme tokens in `default_shadcn_theme.css`.

---

## Dev tips

- **Reset DB**: `rm src/backend/db.sqlite3 && uv run python manage.py migrate`
- **Reseed an existing user**: delete their `daily_logs` rows in admin or shell, then `uv run python manage.py seed_user_logs <username>`.
- **CORS**: configured via `django-cors-headers` in `config/settings.py` — adjust `CORS_ALLOWED_ORIGINS` if frontend runs on non-default port.
- **TZ skew debugging**: `uv run python manage.py shell -c "from datetime import date; print(date.today())"` vs browser's `new Date().toISOString().slice(0,10)`.

---

## Deployment (Vercel — separate FE + BE, same repo)

Two independent Vercel projects pointing at the same monorepo. Each sets its **Root Directory** in Vercel project settings.

### Frontend Vercel project
- **Root Directory**: `src/frontend`
- **Framework**: auto-detected as Vite (also pinned in `src/frontend/vercel.json`)
- **Build**: `pnpm install --frozen-lockfile` → `pnpm build` → output `dist/`
- **SPA routing**: `vercel.json` rewrites non-asset paths to `index.html`
- **Env vars** (Vercel dashboard → Settings → Environment Variables):
  - `VITE_API_URL=https://<your-backend>.vercel.app` (no trailing slash)

### Backend Vercel project
- **Root Directory**: `src/backend`
- **Framework**: Vercel auto-detects Django from `src/backend/wsgi.py` (root-level shim that re-exports `application` from `config/wsgi.py`)
- **Routing**: all paths handled by the Django WSGI app (admin + `/api/*`)
- **Dependencies**: Vercel reads `src/backend/requirements.txt` (pyproject/uv ignored on Vercel; keep `requirements.txt` in sync)
- **Env vars**:
  - `SECRET_KEY` — long random string
  - `DEBUG=False`
  - `ALLOWED_HOSTS=<your-backend>.vercel.app`
  - `CORS_ALLOWED_ORIGINS=https://<your-frontend>.vercel.app`
  - `DATABASE_URL=postgres://…` — **required**. Vercel's serverless FS is ephemeral/read-only, so SQLite won't persist between invocations. Use Neon / Supabase / Railway Postgres. `psycopg[binary]` is in `requirements.txt`.

### Caveats / known limits
- **Migrations**: Vercel build step does not run `manage.py migrate`. Run migrations manually against the external DB before/after deploy:
  ```bash
  DATABASE_URL=postgres://… uv run python manage.py migrate
  ```
- **Django admin static assets**: this project does not bundle WhiteNoise; the JSON API works fine, but `/admin/` CSS/JS may 404 on Vercel. Either add WhiteNoise + `collectstatic`, or host admin elsewhere.
- **Cold starts**: serverless Python lambdas cold-start on idle; first request may be slow.
- **File uploads / media**: no persistent disk on Vercel. Use S3/Cloudinary etc. if you add media later.

### Local preview
```bash
# from src/frontend
vercel dev

# from src/backend
vercel dev
```

---

## Stack reference

| Layer    | Tech                                                                 |
|----------|----------------------------------------------------------------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind 4, Radix UI, Leaflet, lucide  |
| Backend  | Django 6, Django Ninja 1.6, django-cors-headers, django-environ      |
| DB       | SQLite (dev). Swap via `DATABASES` in `config/settings.py`.          |
| Pkg mgr  | pnpm (frontend), uv (backend)                                        |
| Python   | 3.12+                                                                |
| Node     | 18+                                                                  |
