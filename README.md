# Skill Quest (AI Skill Learner)

Hackathon scaffold: **FastAPI** backend + **Vite React** web app for an AI coaching flow (research → live session → summaries). The UI is a game-style shell with **Google sign-in** (OAuth + session cookie) and Gemini Live wiring.

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

Start the API (default: [http://127.0.0.1:8000](http://127.0.0.1:8000)):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check health:

```bash
curl -s http://127.0.0.1:8000/api/health
# {"status":"ok"}
```

API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

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

## Configuration

| Variable            | Where           | Purpose                                                                 |
| ------------------- | --------------- | ----------------------------------------------------------------------- |
| `CORS_ORIGINS`      | `backend/.env`  | Comma-separated allowed browser origins (default: `http://localhost:5173`) |
| `GEMINI_API_KEY`    | `backend/.env`  | Server-only Gemini key; used to mint **ephemeral Live tokens** for the UI |
| `GEMINI_LIVE_MODEL` | `backend/.env`  | Live model id (default: `gemini-3.1-flash-live-preview`; override from `scripts/check_gemini_key.py` if needed) |
| `GEMINI_IMAGE_MODEL` | `backend/.env` | Image model for annotated stills (`POST /api/annotations/form-correction`; default: `gemini-3.1-flash-image-preview`) |
| `GEMINI_RESEARCH_MODEL` | `backend/.env` | Text model for skill research dossiers (`POST /api/skills/create-with-research`; default: `gemini-3-flash-preview`; override from `scripts/check_gemini_key.py`) |
| `VITE_API_URL`      | `frontend/.env` | Optional; leave empty in dev to use Vite’s `/api` proxy                 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `backend/.env` | OAuth 2.0 Web client from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_REDIRECT_URI` | `backend/.env` | Must match an **Authorized redirect URI** on the client (default: `http://localhost:5173/auth/callback`) |
| `JWT_SECRET`        | `backend/.env` | Secret for signing session cookies (set a long random value in production) |
| `COOKIE_SECURE`     | `backend/.env` | `true` when the API is served over HTTPS so cookies get the `Secure` flag |
| `DATABASE_URL`      | `backend/.env` | Optional; default is SQLite at `backend/data/app.db` (skills, research, progress) |

Full list of placeholders (Google, Gemini, Nano Banana): [.env.example](.env.example).

### Google sign-in

1. In Google Cloud Console, create an **OAuth 2.0 Client ID** of type **Web application**.
2. Under **Authorized redirect URIs**, add exactly: `http://localhost:5173/auth/callback` (add your production URL when you deploy).
3. Put the client ID and secret in `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to the same URI you registered.
4. Restart the API and open the app; use **Sign in with Google** in the header. The app completes the callback at `/auth/callback` and stores an HTTP-only session cookie (`sk_session`).

### Skill persistence (SQLite)

The API stores **skills**, **research notes** (versioned per skill), and a **progress timeline** in a local SQLite file (`backend/data/app.db` by default). Tables are created on startup. All routes below require an authenticated session (same `sk_session` cookie as Google sign-in).

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` / `POST` | `/api/skills` | List or create a skill (`title`, optional `notes`) |
| `GET` / `PATCH` / `DELETE` | `/api/skills/{skill_id}` | Read, rename/notes, or delete (cascades research + progress) |
| `GET` / `POST` | `/api/skills/{skill_id}/research` | List research entries (newest first) or append one (`content`, optional `title`, `extra` JSON) |
| `GET` | `/api/skills/{skill_id}/research/latest` | Latest research row (404 if none) |
| `GET` / `POST` | `/api/skills/{skill_id}/progress` | List or append progress events (`kind`, optional `label`, `detail` JSON, `metric_value`) |
| `POST` | `/api/skills/create-with-research` | `title`, `goal`, `level`, optional `category` — Gemini research dossier (`GEMINI_RESEARCH_MODEL`), then save skill + research |
| `GET` | `/api/sessions` | Recent events with `kind === "session"` across all skills (convention for coaching runs) |

Use [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) to try authenticated calls (use **Authorize** with a session cookie, or sign in via the browser and copy the cookie into Swagger).

### List models for your API key

From the repo root (loads `backend/.env` then `.env`):

```bash
python3 scripts/check_gemini_key.py
python3 scripts/check_gemini_key.py --gemini-only
```

Each line shows the model id to use in config (no `models/` prefix) and `supportedGenerationMethods` (look for Live / bidirectional entries when picking `GEMINI_LIVE_MODEL`).

**Security:** The browser never sees the long-lived API key. The frontend calls `POST /api/live/ephemeral-token`, receives a short-lived token, and opens the Live WebSocket with `access_token=` ([ephemeral tokens](https://ai.google.dev/gemini-api/docs/ephemeral-tokens)). For production, protect that endpoint with your own auth.

## Project layout

| Path                             | Role                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| [backend/](backend/)             | FastAPI app, routers under `app/routers/` (auth, skills, sessions, research, live) |
| [frontend/](frontend/)           | React routes + Gemini Live (mic/video, tool `request_form_correction`) + manual capture for annotated stills |
| [.cursor/plans/](.cursor/plans/) | Product / implementation plan                                                               |

## License

Add a license if you open-source the repo.
