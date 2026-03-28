# Track E — Frontend Wiring
**Owner:** Person C (Design/Tech)
**Start:** Hour 0 for stubs. Full wiring at Hour ~14 once the other tracks have working APIs.
**Your job:** The UI is built. Every page exists. You connect them to real data and make the full flow work end-to-end.

---

## What Already Exists (all pages are built)

| Page | File | Current state |
|---|---|---|
| Skill selection | `src/app/skill-selection/page.tsx` | Working — navigates to `/session-prep?skill=...` |
| Session prep | `src/app/session-prep/page.tsx` | Working — mock data, navigates to `/research-loading?skill=...` |
| Research loading | `src/app/research-loading/page.tsx` | Animated but fake — hardcoded steps with `setTimeout` |
| Session briefing | `src/app/session-briefing/page.tsx` | Working UI — hardcoded mock data, navigates to `/live-coaching` |
| Live coaching | `src/app/live-coaching/page.tsx` | Camera works, tier log UI works, no WebSocket connection |
| Post-session report | `src/app/post-session-report/page.tsx` | Full UI built, entirely hardcoded |

**Run dev:** `npm run dev` (Next.js on port 3000 + WS server on port 3001)

---

## The Data Flow (understand this before touching anything)

```
skill-selection
  → navigates to /session-prep?skill=<skill>

session-prep
  → user sets goal + level
  → navigates to /research-loading?skill=<skill>&goal=<goal>&level=<level>

research-loading
  → calls POST /api/research { skill, goal, level }
  → receives SSE stream of status updates (displayed as log entries)
  → on "done" event: stores skillModel + systemPrompt + docId in sessionStorage
  → auto-navigates to /session-briefing?skill=<skill>

session-briefing
  → reads skillModel from sessionStorage
  → displays primaryFocus, sessionPlan data from real skill model
  → on "Step Into the Session": navigates to /live-coaching?skill=<skill>

live-coaching
  → reads skillModelJson + systemPrompt from sessionStorage
  → connects to ws://localhost:3001
  → sends { type: "session_start", skillModelJson }
  → streams video frames + audio
  → receives audio back from Gemini Live (plays it)
  → receives log_entry, annotation_request, tutorial_ref messages
  → on "End": POSTs to /api/session/summary, navigates to /post-session-report

post-session-report
  → reads summary from /api/session/summary response (stored in sessionStorage or fetched on load)
  → displays real data
```

**sessionStorage keys** (use these consistently across all pages):
```
skillModelJson     → JSON.stringify(SkillModel) — set by research-loading
systemPrompt       → string — set by research-loading
docId              → Google Doc ID — set by research-loading
illustrationUrl    → data URI or URL — set by research-loading
sessionNumber      → "1" (or "7" for returning user) — set by session-prep
sessionSummary     → JSON.stringify(SessionSummary) — set by live-coaching on end
```

---

## Task E1 — Wire research-loading page to real SSE

**File:** `src/app/research-loading/page.tsx`

Currently: `setTimeout` + hardcoded steps
After: real `EventSource` that consumes the SSE stream from `POST /api/research`

Replace the entire `useEffect` with:

```typescript
useEffect(() => {
  // Read params passed from session-prep
  const goal = searchParams.get("goal") || `Learn ${skill}`;
  const level = searchParams.get("level") || "beginner";

  let isMounted = true;

  // POST to trigger the pipeline, then read the SSE stream
  // Note: EventSource doesn't support POST, so we use fetch + ReadableStream
  const runResearch = async () => {
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, goal, level }),
      });

      if (!res.ok || !res.body) {
        console.error("[research-loading] Request failed:", res.status);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || !isMounted) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE events from buffer
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep incomplete last chunk

        for (const chunk of lines) {
          if (!chunk.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(chunk.slice(6));
            handleEvent(data);
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      console.error("[research-loading] SSE error:", err);
      // On error: show failure state, allow manual skip to session-briefing
    }
  };

  const handleEvent = (data: any) => {
    switch (data.type) {
      case "status":
        if (isMounted) {
          setActiveSteps(prev => [
            ...prev,
            { id: Date.now(), text: data.message, type: classifyStep(data.message) },
          ]);
          setProgress(p => Math.min(p + 12, 90));
        }
        break;

      case "illustration":
        if (isMounted && data.url) {
          sessionStorage.setItem("illustrationUrl", data.url);
        }
        break;

      case "done":
        if (!isMounted) break;
        // Store everything for downstream pages
        sessionStorage.setItem("skillModelJson", data.skillModelJson || JSON.stringify(data.skillModel));
        sessionStorage.setItem("systemPrompt", data.systemPrompt || "");
        sessionStorage.setItem("docId", data.docUrl?.split("/d/")[1]?.split("/")[0] || "");

        setProgress(100);
        setIsComplete(true);
        // Auto-navigate after brief pause
        setTimeout(() => {
          if (isMounted) router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`);
        }, 1500);
        break;

      case "error":
        console.error("[research-loading] Pipeline error:", data.message);
        // Still allow continue — show the briefing with whatever we have
        setIsComplete(true);
        break;
    }
  };

  runResearch();

  return () => { isMounted = false; };
}, [skill]); // eslint-disable-line

function classifyStep(message: string): string {
  if (message.includes("📺") || message.includes("video") || message.includes("Analyzed")) return "youtube";
  if (message.includes("🔍") || message.includes("Searching")) return "search";
  if (message.includes("✅") || message.includes("ready") || message.includes("complete")) return "check";
  return "target";
}
```

**Also update the `RESEARCH_STEPS` constant** — replace with dynamic state:

```typescript
// Replace RESEARCH_STEPS const and activeSteps state with:
const [activeSteps, setActiveSteps] = useState<Array<{id: number; text: string; type: string}>>([]);
```

Update the render to use the new shape:
```tsx
{activeSteps.map((step) => (
  <motion.div key={step.id} /* ... same animation */ >
    <div className="mt-0.5 shrink-0 bg-zinc-800 p-2 rounded-lg">
      {getIcon(step.type)}
    </div>
    <div className="text-zinc-300 font-medium py-1">{step.text}</div>
  </motion.div>
))}
```

---

## Task E2 — Wire session-prep to pass goal + level

**File:** `src/app/session-prep/page.tsx`

Currently `handleStart()` navigates with only `skill`. Update it to pass all inputs:

```typescript
const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");

const handleStart = () => {
  const params = new URLSearchParams({
    skill,
    goal,
    level,
  });
  router.push(`/research-loading?${params.toString()}`);
};
```

Also set sessionNumber in sessionStorage here (before starting research):
```typescript
const handleStart = () => {
  const isReturning = localStorage.getItem("isReturningUser") === "true";
  sessionStorage.setItem("sessionNumber", isReturning ? "7" : "1");
  // ... navigate
};
```

---

## Task E3 — Wire session-briefing to show real skill model

**File:** `src/app/session-briefing/page.tsx`

Currently reads mock data based on skill name. Update to read from sessionStorage:

```typescript
useEffect(() => {
  const skillModelJson = sessionStorage.getItem("skillModelJson");
  const illustrationUrl = sessionStorage.getItem("illustrationUrl");

  if (skillModelJson) {
    try {
      const skillModel = JSON.parse(skillModelJson);
      setGoal(skillModel.sessionPlan?.primaryFocus || skillModel.metadata?.goal || goal);
      // Could also display: skill model level, video references, etc.
    } catch {
      // Fall through to default
    }
  }

  const isReturning = localStorage.getItem("isReturningUser") === "true";
  setIsReturningUser(isReturning);
}, []);
```

Also update `handleStartLive()` — this is where you pass the skill model context to the live session:

```typescript
const handleStartLive = () => {
  // sessionModelJson is already in sessionStorage from research-loading
  // live-coaching page reads it directly
  router.push(`/live-coaching?skill=${encodeURIComponent(skill)}`);
};
```

---

## Task E4 — Wire live-coaching WebSocket connection

**File:** `src/app/live-coaching/page.tsx`

Track B writes most of this code. Your job is making sure the imports and state are properly placed in the component.

**Checklist for this page:**

1. Add refs and state (check if Track B already added these — don't duplicate):
   ```typescript
   const wsRef = useRef<WebSocket | null>(null);
   const canvasRef = useRef<HTMLCanvasElement | null>(null);
   const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
   const [wsConnected, setWsConnected] = useState(false);
   const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);
   ```

2. The WS connection `useEffect` reads from sessionStorage:
   ```typescript
   // On WS open, send session_start with skillModelJson from sessionStorage
   const skillModelJson = sessionStorage.getItem("skillModelJson") || "{}";
   ws.send(JSON.stringify({ type: "session_start", skillModelJson }));
   ```

3. Display WS connection status in the UI — add a subtle indicator in the header:
   ```tsx
   {/* In the header, next to "COACH ACTIVE" */}
   <div className={clsx(
     "w-2 h-2 rounded-full",
     wsConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
   )} title={wsConnected ? "Connected to coach" : "Connecting..."} />
   ```

4. Wire the `annotatedFrameUrl` into the existing visual aid panel (see Track C doc for the exact JSX).

5. Update the "End Session" handler to store summary params before navigating:
   ```typescript
   const handleEnd = () => {
     if (confirm("End session? Your progress will be saved.")) {
       wsRef.current?.send(JSON.stringify({ type: "session_end" }));
       wsRef.current?.close();
       // Store params for post-session page
       const skillModelJson = sessionStorage.getItem("skillModelJson") || "{}";
       const docId = sessionStorage.getItem("docId") || "";
       const sessionNumber = sessionStorage.getItem("sessionNumber") || "1";
       // Post-session page will use sessionStorage directly
       router.push(`/post-session-report?skill=${encodeURIComponent(skill)}`);
     }
   };
   ```

---

## Task E5 — Wire post-session report page

**File:** `src/app/post-session-report/page.tsx`

Track D writes the fetch logic. Your job is replacing all hardcoded display values with real data.

The page calls `POST /api/session/summary` on load (Track D's code). You just wire the UI.

Key things to update:

```tsx
{/* Session number */}
<h1>Session {summary?.sessionNumber || 1} Complete</h1>

{/* Session meta */}
<p>{skill} • {summary?.date} • {summary?.duration}</p>

{/* What we worked on */}
<ul>
  {(summary?.whatWeFocused || []).map((f, i) => (
    <li key={i}><CheckCircle />{f}</li>
  ))}
</ul>

{/* Skills mastered count */}
<div className="text-4xl font-black text-emerald-400">+{summary?.skillsMastered || 0}</div>

{/* What improved */}
{(summary?.whatImproved || []).map((item, i) => (
  <div key={i}>
    <h3>{item.area}</h3>
    <p>{item.evidence}</p>
  </div>
))}

{/* Needs work */}
{(summary?.needsWork || []).map((item, i) => (
  <div key={i}>
    <AlertTriangle className={item.priority === "high" ? "text-red-400" : "text-amber-400"} />
    {item.area}
  </div>
))}

{/* Next session recommendation */}
<p>{summary?.recommendedNextFocus}</p>

{/* Google Docs link */}
{docUrl && (
  <a href={docUrl} target="_blank">View in Google Docs</a>
)}

{/* Calendar link */}
{calendarUrl && (
  <a href={calendarUrl} target="_blank">
    <Calendar /> View Practice Event
  </a>
)}
```

---

## Task E6 — Returning User flow

For the demo, the "returning user" is triggered by a flag in localStorage. Make sure this works:

**In `skill-selection/page.tsx`** — add a demo toggle (hidden or a small button):
```typescript
// Allow demoing returning user by pressing a keyboard shortcut or hidden button
// Quick hack for demo: add this somewhere in the UI
<button
  onClick={() => {
    const isReturning = localStorage.getItem("isReturningUser") === "true";
    localStorage.setItem("isReturningUser", isReturning ? "false" : "true");
    alert(`Returning user mode: ${isReturning ? "OFF" : "ON"}`);
  }}
  className="text-xs text-zinc-800 absolute bottom-4 right-4" // invisible unless you know it's there
>
  toggle
</button>
```

**In `session-briefing/page.tsx`** — when returning user, show the context timeline cards with pre-seeded data:
```typescript
// The timeline cards (sessions 5 and 6) are already in the JSX
// They show when isReturningUser === true
// For now they use placeholder images — that's fine for demo
```

---

## Fallback Strategy (if APIs aren't ready at demo time)

The UI can always run in mock mode. Keep the original hardcoded data as fallbacks:

```typescript
// In research-loading, if fetch fails after 15 seconds:
setTimeout(() => {
  if (!isComplete) {
    console.warn("[research-loading] Timeout — falling back to demo mode");
    // Manually set a demo skill model
    const demoModel = {
      metadata: { skill, goal: `Learn ${skill}`, level: "beginner" },
      sessionPlan: { primaryFocus: `Learn the fundamentals of ${skill}` },
      // ... minimal shape
    };
    sessionStorage.setItem("skillModelJson", JSON.stringify(demoModel));
    sessionStorage.setItem("systemPrompt", "");
    setProgress(100);
    setIsComplete(true);
    router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`);
  }
}, 15000);
```

For the live session without WebSocket:
```typescript
// In live-coaching, if WS doesn't connect within 3 seconds:
setTimeout(() => {
  if (!wsConnected) {
    console.warn("[live] WS not connected — running in demo mode (UI only)");
    // The existing setTimeout demo behavior (fake log entries, tier 3 annotation) kicks in
    // This is the original demo code that was already there
  }
}, 3000);
```

---

## Integration Order (what to do at Hour 14)

Do these in order — each unlocks the next:

1. **Wire research-loading SSE** (E1) — confirm `POST /api/research` returns SSE and `skillModelJson` lands in sessionStorage
2. **Wire session-prep params** (E2) — confirm `goal` and `level` flow through URL
3. **Wire session-briefing real data** (E3) — confirm skill model reads from sessionStorage
4. **Wire live-coaching WS** (E4) — confirm `session_start` reaches WS server and `session_ready` comes back
5. **Wire post-session** (E5) — confirm summary appears after ending session

Test each step before moving to the next. The whole flow in 5 minutes is the integration test.

---

## Quick Integration Test Script

Run through this manually to confirm the full flow works:

1. Go to `http://localhost:3000`
2. Select "Knife Skills" from skill selection
3. Confirm research-loading shows real status updates from the API
4. Confirm session-briefing shows the actual `primaryFocus` from the skill model
5. Click "Step Into the Session"
6. Confirm browser requests camera + mic permissions
7. Check browser console for `[live] WS connected` and `[live] Session ready`
8. Verify video is appearing in the feed
9. Wait ~30 seconds and confirm a `log_entry` message appears in the coaching log
10. Click "End Session"
11. Confirm post-session report shows real data (not hardcoded "Session 7")
12. Confirm Google Docs URL appears
13. Confirm Calendar event URL appears
