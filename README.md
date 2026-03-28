# Skill Quest (AI Skill Learner)

Hackathon mode: **FastAPI** backend + **Vite React** web app for an AI coaching flow (research → live session → summaries). **No sign-in** — skills, research, and progress live in a **shared pool** in the database (everyone sees and updates the same catalog). Gemini Live wiring is unchanged.

## Prerequisites

- **Python** 3.11+ (3.12 recommended)
- **Node.js** 20+ (LTS) and npm

## Quickstart

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Optional: copy env defaults (CORS, future API keys):

```bash
cp ../.env.example .env
```

Start the API (default: [http://127.0.0.1:3000](http://127.0.0.1:3000)):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 3000
```

Check health:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok"}
```

API docs: [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs)

### 2. Frontend

In a **second** terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)). The home page calls `/api/health` through the dev proxy, so the **API: connected** pill only turns green when the backend is running.

### 3. Production build (frontend only)

```bash
cd frontend
npm run build
npm run preview   # optional: serve dist locally
```

If the app is not served from Vite’s dev server, set `VITE_API_URL` to your API base (see [.env.example](.env.example)) so the browser can reach FastAPI directly.

**Render (or any static host):** For client-side routes (e.g. `/dashboard`, `/onboarding`), add a **Rewrite**: Source `/*`, Destination `/index.html` in the static site’s **Redirects / Rewrites** so deep links load the SPA ([Render docs](https://render.com/docs/redirects-rewrites)).

## Configuration

| Variable            | Where           | Purpose                                                                 |
| ------------------- | --------------- | ----------------------------------------------------------------------- |
| `CORS_ORIGINS`      | `backend/.env`  | Comma-separated allowed browser origins (default: `http://localhost:5173`) |
| `GEMINI_API_KEY`    | `backend/.env`  | Server-only Gemini key; used to mint **ephemeral Live tokens** for the UI |
| `GEMINI_LIVE_MODEL` | `backend/.env`  | Live model id (default: `gemini-3.1-flash-live-preview`; override from `scripts/check_gemini_key.py` if needed) |
| `GEMINI_IMAGE_MODEL` | `backend/.env` | Image model for annotated stills (`POST /api/annotations/form-correction`; default: `gemini-3.1-flash-image-preview`) |
| `GEMINI_RESEARCH_MODEL` | `backend/.env` | Text model for skill research dossiers (`POST /api/skills/create-with-research`; default: `gemini-3-flash-preview`; override from `scripts/check_gemini_key.py`) |
| `VITE_API_URL`      | `frontend/.env` | Optional; leave empty in dev to use Vite’s `/api` proxy                 |
| `DATABASE_URL`      | `backend/.env` | Optional; default is SQLite at `backend/data/app.db` (shared skills, research, progress) |

Full list of placeholders (Gemini, optional Google legacy, etc.): [.env.example](.env.example).

### Shared skill pool

New rows use `user_sub = __shared__` in the DB. **`GET /api/skills` lists every skill** (all `user_sub` values) so older rows from per-user auth still appear. **Anyone can read, create, update, or delete any skill by id** — suitable for a public demo, not for private data.

**Progression is unchanged:** ending a live session still calls `POST /api/skills/{id}/complete-session`, which updates **`stats_level`**, **`stats_progress_percent`** (level-ups when progress crosses 100%), **`stats_sessions`**, **`stats_practice_seconds`**, **`stats_day_streak`**, **`stats_mastered`**, and **`last_practice_at`**, and appends a **`skill_progress_event`** row (`kind: session`) plus a **`skill_session_summary`**. All of that is **`session.commit()`’d** to whatever **`DATABASE_URL`** you use (SQLite locally, Postgres/Supabase in production), so data accumulates over time the same as before—only the login gate was removed.

### Skill persistence (SQLite / Postgres)

The API stores **skills**, **research notes** (versioned per skill), and a **progress timeline**. Tables are created on startup. **No session cookies**; CORS uses `allow_credentials=False`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` / `POST` | `/api/skills` | List or create a skill (`title`, optional `notes`) |
| `GET` / `PATCH` / `DELETE` | `/api/skills/{skill_id}` | Read, rename/notes, or delete (cascades research + progress) |
| `GET` / `POST` | `/api/skills/{skill_id}/research` | List research entries (newest first) or append one (`content`, optional `title`, `extra` JSON) |
| `GET` | `/api/skills/{skill_id}/research/latest` | Latest research row (404 if none) |
| `GET` / `POST` | `/api/skills/{skill_id}/progress` | List or append progress events (`kind`, optional `label`, `detail` JSON, `metric_value`) |
| `POST` | `/api/skills/create-with-research` | `title`, `goal`, `level`, optional `category` — Gemini research dossier (`GEMINI_RESEARCH_MODEL`), then save skill + research |
| `GET` | `/api/sessions` | Recent events with `kind === "session"` across all skills (convention for coaching runs) |

Use [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs) to try the API without auth.

### List models for your API key

From the repo root (loads `backend/.env` then `.env`):

```bash
python3 scripts/check_gemini_key.py
python3 scripts/check_gemini_key.py --gemini-only
```

Each line shows the model id to use in config (no `models/` prefix) and `supportedGenerationMethods` (look for Live / bidirectional entries when picking `GEMINI_LIVE_MODEL`).

**Security:** The browser never sees the long-lived API key. The frontend calls `POST /api/live/ephemeral-token`, receives a short-lived token, and opens the Live WebSocket with `access_token=` ([ephemeral tokens](https://ai.google.dev/gemini-api/docs/ephemeral-tokens)). In hackathon mode this endpoint is also public — anyone who can reach your API can request ephemeral tokens (mitigate with network rules or a gateway if needed).

## Project layout

| Path                             | Role                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| [backend/](backend/)             | FastAPI app, routers under `app/routers/` (skills, sessions, research, live, minimal `/api/auth` stubs) |
| [frontend/](frontend/)           | React routes + Gemini Live (mic/video, tool `request_form_correction`) + manual capture for annotated stills |
| [.cursor/plans/](.cursor/plans/) | Product / implementation plan                                                               |

## License

Add a license if you open-source the repo.
