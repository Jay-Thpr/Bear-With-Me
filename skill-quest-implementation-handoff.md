# Skill Quest — Implementation Handoff

**Pending Features · Agent-Ready Specifications**
March 2026 | FastAPI + React 19 + Gemini stack

---

## Overview

This document specifies three remaining implementation tasks for the Skill Quest app. Each section is fully self-contained: it lists every file to create or modify, the exact code to write, and the acceptance criteria to verify. No external context is required beyond this document and the existing codebase.

| # | Feature | Status |
|---|---------|--------|
| 1 | Google Docs Export (user OAuth) | Scope granted — still uses service account |
| 2 | Character Persistence | No DB table — all generations ephemeral |
| 3 | Dashboard Live Panels | Calendar, milestones, sessions hardcoded |

---

## Feature 1 — Google Docs Export via User OAuth

> The `documents` scope is already in the OAuth flow. `session_summary_docs.py` currently uses a **service account**. Replace it with the authenticated user's own credentials.

### Goal

Session summaries exported to Google Docs should be created in the user's own Drive (using their OAuth token), not a shared service-account Drive. This makes the document visible directly in the user's My Drive.

### Modify: `backend/app/services/session_summary_docs.py`

Replace the credential setup block. Find the section that builds service-account credentials (likely `ServiceAccountCredentials` or a JSON key path) and replace it entirely:

```python
# REMOVE old service-account code — delete lines resembling:
# from google.oauth2 import service_account
# creds = service_account.Credentials.from_service_account_file(...)

# ADD user-credential flow:
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.services.google_oauth import get_valid_credentials, credential_capabilities
from app.config import settings

def export_session_summary_to_docs(
    db,
    user_sub: str,
    skill_name: str,
    summary_text: str,
) -> str | None:
    """
    Creates a Google Doc in the user's Drive containing the session summary.
    Returns the document URL, or None if the user lacks the documents scope.
    """
    creds = get_valid_credentials(db, user_sub)
    if creds is None:
        return None

    caps = credential_capabilities(creds)
    if not caps.get("documentsGranted"):
        return None

    user_creds = Credentials(
        token=creds.token,
        refresh_token=creds.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=[
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive.file",
        ],
    )

    docs_service = build("docs", "v1", credentials=user_creds, cache_discovery=False)

    # Create blank doc
    doc = docs_service.documents().create(
        body={"title": f"Skill Quest – {skill_name} Session Summary"}
    ).execute()
    doc_id  = doc["documentId"]
    doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"

    # Insert content
    docs_service.documents().batchUpdate(
        documentId=doc_id,
        body={"requests": [{"insertText": {"location": {"index": 1}, "text": summary_text}}]},
    ).execute()

    return doc_url
```

### Update callers

Search for all calls to the old export function and update the signature to pass `db` and `user_sub`:

```python
# In skills.py complete-session handler (or wherever summary export is called):
doc_url = export_session_summary_to_docs(
    db=db,
    user_sub=user_sub,
    skill_name=skill.name,
    summary_text=summary_text,
)
# Store doc_url only when not None
```

### pip dependency

Add to `requirements.txt`:

```
google-api-python-client>=2.100.0
google-auth-httplib2>=0.2.0
```

> May already be present. No service account JSON key file is needed after this change. Remove `GOOGLE_APPLICATION_CREDENTIALS` from `.env` if it was set.

### Acceptance Criteria

- Completing a session for a user with the `documents` scope creates a Google Doc in their My Drive.
- The doc title is `Skill Quest – {skill name} Session Summary`.
- Completing a session for a user without the `documents` scope → no error, `doc_url` is `null` in the response.
- No service account file is referenced anywhere in the codebase after this change.

---

## Feature 2 — Character Persistence

> Currently, character images are generated in-memory and returned to the client. There is no database table, so refreshing the page loses the character. This task adds a `GeneratedCharacter` table and wires `GET`/`DELETE` endpoints.

### `backend/app/models.py` — Add new SQLModel

```python
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class GeneratedCharacter(SQLModel, table=True):
    __tablename__ = "generated_characters"

    id:         Optional[int] = Field(default=None, primary_key=True)
    user_sub:   str           = Field(index=True)
    skill_id:   Optional[int] = Field(default=None, foreign_key="skills.id")
    image_b64:  str           # base64-encoded PNG stored directly (~200 KB typical)
    prompt:     str           = ""
    created_at: datetime      = Field(default_factory=datetime.utcnow)
```

> If `image_b64` storage feels heavy, replace with a file path and save PNGs to `/static/characters/` served by FastAPI's `StaticFiles` mount.

### `backend/app/database.py` — Add migration

Add alongside existing migration helpers and call at app init:

```python
def migrate_generated_characters(engine):
    """Create generated_characters table if it does not exist."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS generated_characters (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_sub   TEXT NOT NULL,
                skill_id   INTEGER REFERENCES skills(id),
                image_b64  TEXT NOT NULL,
                prompt     TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """))
        conn.commit()

# Call it in the startup sequence:
migrate_generated_characters(engine)
```

### `backend/app/routers/characters.py` — Persist + list + delete

After generating the image, persist it and return the DB id. Then add `GET` and `DELETE` endpoints:

```python
from app.models import GeneratedCharacter
from sqlmodel import Session as DBSession, select

@router.post("/generate")
async def generate_character(
    body: CharacterGenerateRequest,
    user: dict = Depends(require_user),
    db: DBSession = Depends(get_db),
):
    # ... existing generation code ...
    image_b64 = run_generation(body.prompt, body.remove_bg)  # existing logic

    char = GeneratedCharacter(
        user_sub=str(user["id"]),
        skill_id=body.skill_id,   # add Optional[int] to CharacterGenerateRequest model
        image_b64=image_b64,
        prompt=body.prompt,
    )
    db.add(char)
    db.commit()
    db.refresh(char)

    return {"id": char.id, "image_b64": image_b64}


@router.get("/")
async def list_characters(
    user: dict = Depends(require_user),
    db: DBSession = Depends(get_db),
):
    chars = db.exec(
        select(GeneratedCharacter)
        .where(GeneratedCharacter.user_sub == str(user["id"]))
        .order_by(GeneratedCharacter.created_at.desc())
    ).all()
    return [
        {"id": c.id, "image_b64": c.image_b64, "prompt": c.prompt,
         "skill_id": c.skill_id, "created_at": c.created_at}
        for c in chars
    ]


@router.delete("/{char_id}")
async def delete_character(
    char_id: int,
    user: dict = Depends(require_user),
    db: DBSession = Depends(get_db),
):
    char = db.get(GeneratedCharacter, char_id)
    if not char or char.user_sub != str(user["id"]):
        raise HTTPException(status_code=404)
    db.delete(char)
    db.commit()
    return {"ok": True}
```

### `frontend/src/api/characters.ts` — Create

```typescript
import { API_BASE } from './config';

export interface CharacterOut {
  id: number;
  image_b64: string;
  prompt: string;
  skill_id: number | null;
  created_at: string;
}

export async function generateCharacter(
  prompt: string,
  skillId?: number,
  removeBg = false,
): Promise<CharacterOut> {
  const res = await fetch(`${API_BASE}/api/characters/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prompt, skill_id: skillId, remove_bg: removeBg }),
  });
  if (!res.ok) throw new Error('Character generation failed');
  return res.json();
}

export async function listCharacters(): Promise<CharacterOut[]> {
  const res = await fetch(`${API_BASE}/api/characters/`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch characters');
  return res.json();
}

export async function deleteCharacter(id: number): Promise<void> {
  await fetch(`${API_BASE}/api/characters/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
```

### Acceptance Criteria

- `POST /api/characters/generate` returns `{id, image_b64}` and the row is queryable in SQLite.
- `GET /api/characters/` returns all characters for the authenticated user, most recent first.
- `DELETE /api/characters/{id}` removes the row; another user's id returns 404.
- Page refresh no longer loses the generated character — it can be re-fetched.

---

## Feature 3 — Dashboard Live Panels

> The Dashboard currently renders three hardcoded panels: upcoming sessions, milestones, and calendar. Replace all three with real data from existing endpoints.

### Goal

Wire the Dashboard to real data sources. No new backend endpoints are needed — all the data already exists.

### Data sources map

| Panel | Existing endpoint | Key fields |
|-------|-------------------|------------|
| Recent Sessions | `GET /api/sessions/` | `skill_id`, `created_at`, `kind=session` |
| Skill Milestones | `GET /api/skills/{id}/lesson-plan` | `checkpoints[].goal`, `checkpoints[].order_index` |
| Keep Practicing | `GET /api/skills/` | `name`, `progress_pct` |

### `frontend/src/api/sessions.ts` — Create (or modify if partial)

```typescript
import { API_BASE } from './config';

export interface SessionEvent {
  id: number;
  skill_id: number;
  created_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

export async function fetchSessions(): Promise<SessionEvent[]> {
  const res = await fetch(`${API_BASE}/api/sessions/`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}
```

### `frontend/src/hooks/useDashboardData.ts` — Create

```typescript
import { useEffect, useState } from 'react';
import { fetchSkills, fetchLessonPlan } from '../api/skills';
import { fetchSessions } from '../api/sessions';

export function useDashboardData() {
  const [skills,         setSkills]         = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [milestones,     setMilestones]     = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sk, sess] = await Promise.all([fetchSkills(), fetchSessions()]);
        setSkills(sk);
        setRecentSessions(sess.slice(0, 5));  // last 5

        // Load lesson plan for the first (most active) skill
        if (sk.length > 0) {
          const lp = await fetchLessonPlan(sk[0].id);
          setMilestones(lp?.checkpoints ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { skills, recentSessions, milestones, loading };
}
```

### `frontend/src/pages/DashboardPage.tsx` — Replace hardcoded panels

Delete the existing hardcoded arrays (`UPCOMING_SESSIONS`, `MILESTONES`, etc.) and replace the three panel blocks:

```tsx
import { useDashboardData } from '../hooks/useDashboardData';

export default function DashboardPage() {
  const { skills, recentSessions, milestones, loading } = useDashboardData();

  if (loading) return <div className="dashboard-loading">Loading…</div>;

  return (
    <div className="dashboard">

      {/* Recent Sessions Panel */}
      <section className="panel">
        <h3>Recent Sessions</h3>
        {recentSessions.length === 0
          ? <p className="muted">No sessions yet.</p>
          : <ul>
              {recentSessions.map(s => (
                <li key={s.id}>
                  {skills.find(sk => sk.id === s.skill_id)?.name ?? 'Unknown skill'}
                  <span className="date">{new Date(s.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
        }
      </section>

      {/* Milestones Panel */}
      <section className="panel">
        <h3>Milestones — {skills[0]?.name ?? 'Your skill'}</h3>
        {milestones.length === 0
          ? <p className="muted">Generate a skill to see milestones.</p>
          : <ol>
              {milestones.map((cp: any) => (
                <li key={cp.order_index}>{cp.goal}</li>
              ))}
            </ol>
        }
      </section>

      {/* Keep Practicing Panel */}
      <section className="panel">
        <h3>Keep Practicing</h3>
        {skills.length === 0
          ? <p className="muted">Add a skill to get started.</p>
          : skills.slice(0, 3).map((sk: any) => (
              <div key={sk.id} className="upcoming-skill">
                <strong>{sk.name}</strong>
                <span>{sk.progress_pct ?? 0}% complete</span>
              </div>
            ))
        }
      </section>

    </div>
  );
}
```

### Acceptance Criteria

- Dashboard renders real session history after at least one session is completed.
- Milestones panel shows the lesson plan checkpoints for the user's first skill.
- Keep Practicing panel lists real skills with progress percentages.
- All three panels show a graceful empty-state message when no data exists.
- No hardcoded arrays remain in `DashboardPage.tsx`.

---

## Appendix — Files Changed Summary

| Action | File | Feature |
|--------|------|---------|
| MODIFY | `backend/app/services/session_summary_docs.py` | 1 — Replace service account with user OAuth |
| MODIFY | `backend/app/models.py` | 2 — Add GeneratedCharacter table |
| MODIFY | `backend/app/database.py` | 2 — Add migration for new table |
| MODIFY | `backend/app/routers/characters.py` | 2 — Persist + list + delete endpoints |
| CREATE | `frontend/src/api/characters.ts` | 2 — Frontend API module |
| CREATE | `frontend/src/api/sessions.ts` | 3 — fetchSessions helper |
| CREATE | `frontend/src/hooks/useDashboardData.ts` | 3 — Dashboard data hook |
| MODIFY | `frontend/src/pages/DashboardPage.tsx` | 3 — Replace hardcoded panels |

### pip packages to add to `requirements.txt`

```
google-api-python-client>=2.100.0
google-auth-httplib2>=0.2.0
```

> Needed for Feature 1 (Docs export). May already be present if service account Docs export was previously implemented.
