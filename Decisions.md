# Glitch — Locked Decisions

**Project:** Real-Time Self-Training Coach
**Hackathon:** UCLA Glitch x DeepMind
**Team:** 4 people (1 product, 2 tech, 1 design/tech — all can code)
**Constraint:** ~24-hour build

---

## Tech Stack

| Layer | Decision | Reason |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + React | Full-stack in one repo, fastest DX, Vercel deploy in 2 min |
| **Styling** | Tailwind CSS | No time for custom CSS — utility-first wins hackathons |
| **Language** | TypeScript throughout | Catches errors fast under pressure |
| **Real-time bridge** | Node.js `ws` WebSocket server (`/server` folder, same repo) | Next.js API routes don't support persistent WebSocket connections — needed for Gemini Live bidirectional stream |
| **Backend logic** | Next.js API routes (REST) for everything non-realtime | Workspace APIs, session management, post-session writes |
| **Deployment** | Vercel (frontend + API routes) + local Node server for demo | Ship fast; WebSocket server runs locally during demo |

---

## MVP Scope Cut (24-hour build)

### IN — must work for demo
- **Research phase:** User picks skill → Gemini + YouTube → structured skill doc → saved to Google Docs
- **Live coaching session:** Gemini Live video feed, verbal feedback, Tier 1–3 interventions (ambient, verbal, annotated frame)
- **Post-session:** Summary generated → Google Docs, next session → Google Calendar, assets → Google Drive

### STRETCH — build if time remains after core is done
- **Phase 4 (between sessions):** Pre-session notifications, nudges, weekly reports
- **Phase 5 live multi-session:** Real returning-user update loop

### PRE-SEEDED for demo
- **Returning user asset:** 5 sessions of fake history, pre-loaded in Docs. Shows progression without building the full update loop (replaced by Phase 5 if stretch goal is reached).
- **Research phase during demo:** Run live briefly, but have a pre-computed cooking skill doc as fallback if it's slow.

### RISKY — build with fallback
- **Nano Banana (annotated frames):** Gemini's image generation model. Build Tier 3 for real — grab a frame from the live video, send to Gemini image gen with a prompt to draw spatial corrections (circles, arrows) on the user's technique. If it fails during demo, fall back to verbal-only. Coach says "let me show you something" → narrates instead.

---

## Architecture Decisions

### Gemini Live Connection
```
Browser → WebSocket (ws server, /server) → Gemini Live API
                                         ↓ function calls
                              Next.js API routes
                                         ↓
                              Google Workspace APIs
```

### Video Feed
- Browser captures webcam via `getUserMedia`
- Sends frames (1 FPS) as base64 over WebSocket to ws server
- ws server forwards to Gemini Live session

### Intervention Logic
- Tier 1–2: Pure Gemini Live voice output (no backend call needed)
- Tier 3 (annotated frame): Gemini calls `generate_annotation()` function → Next.js API route → Nano Banana → returns annotated image URL → displayed in UI
- Tier 4 (tutorial reference): Gemini calls `surface_tutorial()` → pulls from skill doc stored in Docs → returns YouTube URL + timestamp

---

## Team Split

| Person | Owns | Notes |
|---|---|---|
| **Person A (Tech)** | Research pipeline | Gemini + YouTube → skill doc → Google Docs write |
| **Person B (Tech)** | Live session loop | WebSocket server, Gemini Live integration, intervention tiers |
| **Person C (Design/Tech)** | Frontend + UI | Next.js pages, Tailwind, session UI, annotation display |
| **Person D (Product)** | Post-session + Workspace | Docs summary, Calendar scheduling, Drive assets, demo script |

**Parallel critical path:**
- A and B can work simultaneously from hour 1
- C builds UI against mock data until B has the WebSocket working
- D builds Workspace writes independently (just API calls)
- Integration point: ~hour 16–18

---

## Resolved Decisions

- **Nano Banana:** Gemini image generation model. Use Gemini API (image gen) to draw spatial corrections on a captured frame. Same API key, no separate setup.
- **Google Workspace auth:** Service account. One-time setup, no OAuth redirect flow needed during demo.
- **Demo environment:** Local during demo. Deploy to Vercel/Railway as stretch goal if time allows.
- **Research pipeline (short-term):** Web-grounded retrieval is the primary evidence path. YouTube is captured as lightweight tutorial enrichment only. Deep per-video parsing is intentionally out of the blocking research path until latency and reliability justify bringing it back.
- **Research artifact format:** The canonical final research output is a JSON dossier optimized for internal coaching quality. Human-readable renderings are secondary and can be derived later.

---

## Demo Script (locked)

1. **Research phase** (~2 min): "Watch the system teach itself knife skills" — shows YouTube analysis, skill doc appearing in Google Docs
2. **Live session** (~5 min): Live cooking on camera, verbal corrections, one annotated frame moment
3. **Post-session** (~1 min): Summary in Docs, Calendar invite created
4. **Speed round** (~1 min): Different skill, proves it's not a cooking app
5. **Returning user** (~1 min): Pre-seeded 5-session history, show progression timeline

---

*Last updated: 2026-03-27*
