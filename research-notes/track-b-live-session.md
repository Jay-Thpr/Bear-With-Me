# Track B — Live Session (WebSocket + Gemini Live)
**Owner:** Person B (Tech)
**Start:** Hour 0 — stub the system prompt string and start immediately. Don't wait for Track A to finish.
**Integration point:** ~Hour 14, swap the stubbed system prompt for the real `assembleSystemPrompt()` output from Track A.

---

## What You're Building

The entire real-time coaching loop:
1. Browser connects to the WebSocket server
2. Browser sends the skill model JSON (produced by Track A) as a `session_start` message
3. WS server opens a Gemini Live session with the assembled system prompt
4. Browser captures webcam at 1 FPS → sends frames over WS → server forwards to Gemini Live
5. Browser captures mic audio → sends chunks → server forwards to Gemini Live
6. Gemini Live sends audio response → server forwards back → browser plays it
7. Gemini Live emits function calls (log, annotate, reference tutorial, update status) → server handles them
8. Server sends structured messages to browser for UI updates (tier logs, annotation trigger, tutorial ref)

---

## What Already Exists

| File | What it does |
|---|---|
| `server/index.ts` | WebSocket server stub — listens on port 3001, logs connections, does nothing else yet |
| `src/app/live-coaching/page.tsx` | Full coaching UI — camera feed, tier log, visual aid panel, mic/cam controls, timer. Camera is working. **No WS connection yet.** |
| `package.json` | `ws` (v8) already installed. `@google/genai` (v1.46) already installed. Both available in server code. |

**Run server alone:** `npm run dev:ws`
**Run everything:** `npm run dev` (starts both Next.js and the WS server via `concurrently`)

**Important:** The WS server runs as a separate Node.js process (`server/index.ts`), not inside Next.js. It has direct access to all `lib/` files. Import from `../lib/...`.

---

## Environment Variables

```bash
GEMINI_API_KEY=     # Required — Gemini API key
WS_PORT=3001        # Optional — default is 3001
```

---

## Shared Interface Contract

Get this from Track A's `lib/types.ts` once it exists. For now, use this stub inline:

```typescript
// Paste into server/types.ts for now — Track A will own the canonical version in lib/types.ts
type WSMessageToServer =
  | { type: "session_start"; skillModelJson: string; userModelJson?: string }
  | { type: "video_frame"; frameBase64: string; mimeType: "image/jpeg" }
  | { type: "audio_chunk"; audioBase64: string; sampleRate?: number }
  | { type: "session_end" };

type WSMessageToClient =
  | { type: "session_ready" }
  | { type: "audio"; audioBase64: string; mimeType: string }
  | { type: "log_entry"; tier: 1 | 2 | 3 | 4; message: string; timestamp: string }
  | { type: "annotation_request"; frameBase64: string; correction: string; bodyPart: string }
  | { type: "tutorial_ref"; url: string; timestamp: string; reason: string }
  | { type: "skill_status_update"; area: string; status: "needs_work" | "improving" | "mastered" }
  | { type: "error"; message: string };
```

---

## Task B1 — Wire Gemini Live into the WebSocket server

**File:** `server/index.ts` — full rewrite

This is the core of the live session. The WS server acts as a bridge between the browser and Gemini Live.

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, type LiveConnectConfig } from "@google/genai";
import { config } from "dotenv";

config({ path: ".env.local" });

const PORT = parseInt(process.env.WS_PORT ?? "3001", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[ws] Listening on port ${PORT}`);
});

wss.on("connection", (browserWs: WebSocket) => {
  console.log("[ws] Browser connected");
  let liveSession: any = null; // Gemini Live session handle
  let sessionReady = false;

  // Helper: send to browser
  const send = (msg: object) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify(msg));
    }
  };

  // ── Handle messages from browser ──
  browserWs.on("message", async (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.error("[ws] Non-JSON message received");
      return;
    }

    switch (msg.type) {
      case "session_start":
        await startGeminiSession(msg.skillModelJson, msg.userModelJson, send, (session: any) => {
          liveSession = session;
          sessionReady = true;
          send({ type: "session_ready" });
        });
        break;

      case "video_frame":
        if (!sessionReady || !liveSession) return;
        await forwardVideoFrame(liveSession, msg.frameBase64, msg.mimeType || "image/jpeg");
        break;

      case "audio_chunk":
        if (!sessionReady || !liveSession) return;
        await forwardAudio(liveSession, msg.audioBase64);
        break;

      case "session_end":
        if (liveSession) {
          await liveSession.close();
          liveSession = null;
          sessionReady = false;
        }
        break;
    }
  });

  browserWs.on("close", () => {
    console.log("[ws] Browser disconnected");
    if (liveSession) {
      liveSession.close().catch(() => {});
      liveSession = null;
    }
  });

  browserWs.on("error", (err) => {
    console.error("[ws] Error:", err.message);
  });
});

// ── Open a Gemini Live session ──
async function startGeminiSession(
  skillModelJson: string,
  userModelJson: string | undefined,
  send: (msg: object) => void,
  onReady: (session: any) => void
) {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Import system prompt assembler from lib
    const { assembleSystemPrompt } = await import("../lib/session-context");

    let systemInstruction: string;
    try {
      const skillModel = JSON.parse(skillModelJson);
      const userModel = userModelJson ? JSON.parse(userModelJson) : null;
      systemInstruction = assembleSystemPrompt(skillModel, userModel);
    } catch {
      // Fallback stub if JSON parse fails — allows dev without a real skill model
      systemInstruction = `You are a real-time coaching assistant watching the user via their camera. Give specific, concise verbal feedback. Be encouraging. Focus on technique.`;
      console.warn("[ws] Failed to parse skillModelJson — using stub system prompt");
    }

    const sessionConfig: LiveConnectConfig = {
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
        responseModalities: ["AUDIO"],
        tools: [
          {
            functionDeclarations: [
              {
                name: "log_observation",
                description: "Log every piece of coaching feedback with its tier level",
                parameters: {
                  type: "object",
                  properties: {
                    tier: { type: "number", description: "1=acknowledge, 2=verbal correct, 3=visual correct, 4=tutorial" },
                    description: { type: "string", description: "What was observed or said" },
                    timestamp: { type: "string", description: "Session timestamp MM:SS" },
                  },
                  required: ["tier", "description", "timestamp"],
                },
              },
              {
                name: "generate_annotation",
                description: "Generate a visual correction overlay on the user's current video frame. Use when a spatial/positional correction has been given verbally 2-3 times without improvement.",
                parameters: {
                  type: "object",
                  properties: {
                    correction: { type: "string", description: "What needs to be corrected" },
                    bodyPart: { type: "string", description: "Which body part or tool to highlight" },
                  },
                  required: ["correction", "bodyPart"],
                },
              },
              {
                name: "reference_tutorial",
                description: "Show the student a specific YouTube tutorial clip. Use for fundamental technique misunderstandings.",
                parameters: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "YouTube URL" },
                    timestamp: { type: "string", description: "Timestamp in the video MM:SS" },
                    reason: { type: "string", description: "Why you are showing this clip" },
                  },
                  required: ["url", "timestamp", "reason"],
                },
              },
              {
                name: "update_skill_status",
                description: "Update the status of a skill area based on observed improvement or mastery",
                parameters: {
                  type: "object",
                  properties: {
                    area: { type: "string", description: "The skill area (e.g., 'pinch grip', 'blade angle')" },
                    status: { type: "string", enum: ["needs_work", "improving", "mastered"] },
                  },
                  required: ["area", "status"],
                },
              },
            ],
          },
        ],
      },
    };

    const session = await ai.live.connect(sessionConfig);
    onReady(session);

    // ── Listen for Gemini Live responses ──
    session.on("message", async (message: any) => {
      // Audio response — forward to browser for playback
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/")) {
            send({
              type: "audio",
              audioBase64: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
            });
          }
        }
      }

      // Function calls — handle and respond
      if (message.toolCall?.functionCalls) {
        await handleFunctionCalls(message.toolCall.functionCalls, send, session);
      }
    });

    session.on("error", (err: any) => {
      console.error("[ws] Gemini Live error:", err);
      send({ type: "error", message: "Coaching session error" });
    });

  } catch (err) {
    console.error("[ws] Failed to start Gemini session:", err);
    send({ type: "error", message: "Failed to start coaching session" });
  }
}

// ── Forward video frame to Gemini Live ──
async function forwardVideoFrame(session: any, frameBase64: string, mimeType: string) {
  try {
    await session.sendRealtimeInput({
      video: { data: frameBase64, mimeType },
    });
  } catch (err) {
    console.error("[ws] Frame forward error:", err);
  }
}

// ── Forward audio to Gemini Live ──
async function forwardAudio(session: any, audioBase64: string) {
  try {
    await session.sendRealtimeInput({
      audio: { data: audioBase64 },
    });
  } catch (err) {
    console.error("[ws] Audio forward error:", err);
  }
}

// ── Handle function calls from Gemini Live ──
async function handleFunctionCalls(
  functionCalls: any[],
  send: (msg: object) => void,
  session: any
) {
  const responses: any[] = [];

  for (const call of functionCalls) {
    let result: any = { ok: true };

    switch (call.name) {
      case "log_observation": {
        const { tier, description, timestamp } = call.args;
        console.log(`[coaching] Tier ${tier}: ${description}`);

        // Notify browser for UI log
        send({ type: "log_entry", tier: Number(tier), message: description, timestamp });

        // POST to Next.js session log endpoint
        try {
          await fetch("http://localhost:3000/api/session/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier, description, timestamp }),
          });
        } catch { /* non-critical */ }
        break;
      }

      case "generate_annotation": {
        const { correction, bodyPart } = call.args;
        console.log(`[coaching] Annotation requested: ${correction} on ${bodyPart}`);

        // Send annotation request to browser — browser will provide the frame
        // Then call /api/annotate to generate the visual
        send({ type: "annotation_request", correction, bodyPart });

        // Note: the actual annotation response flows back via the browser
        // browser captures current frame → POSTs to /api/annotate → gets imageUrl → displays it
        // This is a fire-and-forget from the WS perspective
        break;
      }

      case "reference_tutorial": {
        const { url, timestamp, reason } = call.args;
        send({ type: "tutorial_ref", url, timestamp, reason });
        break;
      }

      case "update_skill_status": {
        const { area, status } = call.args;
        send({ type: "skill_status_update", area, status });
        try {
          await fetch("http://localhost:3000/api/session/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ area, status }),
          });
        } catch { /* non-critical */ }
        break;
      }
    }

    responses.push({
      id: call.id,
      name: call.name,
      response: { output: result },
    });
  }

  // Send function responses back to Gemini so it can continue
  try {
    await session.sendToolResponse({ functionResponses: responses });
  } catch (err) {
    console.error("[ws] Failed to send function responses:", err);
  }
}

export { wss };
```

---

## Task B2 — Video frame capture (browser side)

**File:** `src/app/live-coaching/page.tsx`

The camera feed is already working (videoRef + getUserMedia). Add frame capture at 1 FPS and send over WebSocket.

Add to the component:

```typescript
// Add these refs + state
const wsRef = useRef<WebSocket | null>(null);
const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
const canvasRef = useRef<HTMLCanvasElement | null>(null);
const [wsConnected, setWsConnected] = useState(false);

// Add this useEffect for WebSocket connection
useEffect(() => {
  const ws = new WebSocket("ws://localhost:3001");
  wsRef.current = ws;

  ws.onopen = () => {
    console.log("[live] WS connected");
    setWsConnected(true);

    // Send session_start with skill model from sessionStorage
    const skillModelJson = sessionStorage.getItem("skillModelJson") || "{}";
    const systemPrompt = sessionStorage.getItem("systemPrompt") || "";
    ws.send(JSON.stringify({ type: "session_start", skillModelJson }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch {
      console.error("[live] Bad WS message");
    }
  };

  ws.onerror = (err) => console.error("[live] WS error:", err);
  ws.onclose = () => {
    console.log("[live] WS disconnected");
    setWsConnected(false);
  };

  return () => {
    ws.close();
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
  };
}, []); // eslint-disable-line

// Start frame capture once WS is connected and camera is on
useEffect(() => {
  if (!wsConnected || !camOn || isPaused) {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    return;
  }

  // Create offscreen canvas for frame capture
  if (!canvasRef.current) {
    canvasRef.current = document.createElement("canvas");
  }

  frameIntervalRef.current = setInterval(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;

    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, 640, 480);
    const frameBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    ws.send(JSON.stringify({
      type: "video_frame",
      frameBase64,
      mimeType: "image/jpeg",
    }));
  }, 1000); // 1 FPS

  return () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
  };
}, [wsConnected, camOn, isPaused]);
```

---

## Task B3 — Audio bidirectional stream (browser side)

**File:** `src/app/live-coaching/page.tsx`

Add to component (alongside B2 code):

```typescript
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const audioContextRef = useRef<AudioContext | null>(null);

// Mic capture + send to WS
useEffect(() => {
  if (!wsConnected || !micOn) {
    mediaRecorderRef.current?.stop();
    return;
  }

  const startMic = async () => {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(micStream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0 || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const buffer = await e.data.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        wsRef.current.send(JSON.stringify({ type: "audio_chunk", audioBase64 }));
      };

      recorder.start(250); // Send every 250ms
    } catch (err) {
      console.error("[live] Mic access failed:", err);
    }
  };

  startMic();
  return () => {
    mediaRecorderRef.current?.stop();
  };
}, [wsConnected, micOn]);

// Audio playback from Gemini
const playAudio = async (audioBase64: string, mimeType: string) => {
  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const audioCtx = audioContextRef.current;
    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const buffer = await audioCtx.decodeAudioData(bytes.buffer);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch (err) {
    console.error("[live] Audio playback error:", err);
  }
};
```

---

## Task B4 — WS message handler (browser side)

**File:** `src/app/live-coaching/page.tsx`

Add the `handleWsMessage` function and the annotation capture flow:

```typescript
// Add state
const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);

const handleWsMessage = async (msg: any) => {
  switch (msg.type) {
    case "session_ready":
      console.log("[live] Session ready");
      break;

    case "audio":
      await playAudio(msg.audioBase64, msg.mimeType);
      break;

    case "log_entry": {
      const newEntry: LogEntry = {
        id: `log-${Date.now()}`,
        timeText: formatTime(10 * 60 - timeRemaining),
        tier: msg.tier as Tier,
        message: msg.message,
      };
      setLogs(prev => [...prev, newEntry]);
      setCurrentTier(msg.tier as Tier);
      setCurrentMessage(msg.message);
      break;
    }

    case "annotation_request": {
      // Capture current frame and POST to /api/annotate
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement("canvas");
      if (video && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        const frameBase64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

        try {
          const res = await fetch("/api/annotate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frameBase64,
              correction: msg.correction,
              bodyPart: msg.bodyPart,
            }),
          });
          const { imageUrl } = await res.json();
          if (imageUrl) {
            setAnnotatedFrameUrl(imageUrl);
            setShowVisualAid("annotated");
          }
        } catch (err) {
          console.error("[live] Annotation failed:", err);
        }
      }
      break;
    }

    case "tutorial_ref":
      // Show the tutorial video panel
      setShowVisualAid("video");
      // Store tutorial ref for display
      setCurrentMessage(`Watch this technique: ${msg.reason}`);
      setCurrentTier(4);
      break;

    case "error":
      console.error("[live] WS error:", msg.message);
      break;
  }
};
```

Update the "End Session" handler to close WS gracefully:

```typescript
const handleEnd = () => {
  if (confirm("End session? Your progress will be saved.")) {
    wsRef.current?.send(JSON.stringify({ type: "session_end" }));
    wsRef.current?.close();
    router.push(`/post-session-report?skill=${encodeURIComponent(skill)}`);
  }
};
```

---

## Task B5 — Add status APIs for function call logging

**New file:** `src/app/api/session/log/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

// In-memory store — adequate for hackathon
const sessionLogs: Map<string, Array<{tier: number; description: string; timestamp: string; createdAt: string}>> = new Map();
const CURRENT_SESSION = "active"; // Single session for demo

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tier, description, timestamp } = body;

  const log = sessionLogs.get(CURRENT_SESSION) || [];
  log.push({ tier, description, timestamp, createdAt: new Date().toISOString() });
  sessionLogs.set(CURRENT_SESSION, log);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const log = sessionLogs.get(CURRENT_SESSION) || [];
  return NextResponse.json({ log });
}

// Export for use by Track D's summary generator
export { sessionLogs, CURRENT_SESSION };
```

**New file:** `src/app/api/session/status/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

const skillStatuses: Map<string, string> = new Map();

export async function POST(req: NextRequest) {
  const { area, status } = await req.json();
  skillStatuses.set(area, status);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ statuses: Object.fromEntries(skillStatuses) });
}

export { skillStatuses };
```

---

## Gemini Live API — Key Details

The `@google/genai` package (v1.46) is already installed. The Live API is accessed via `ai.live.connect()`.

**Critical notes:**
- Live sessions are stateful — they persist the conversation context across messages
- `sendRealtimeInput({ video: ... })` for frames, `sendRealtimeInput({ audio: ... })` for audio
- The session emits `message` events; check `message.serverContent` for model turn content and `message.toolCall` for function calls
- Always send `sendToolResponse` after handling function calls or the session stalls
- Sessions auto-close after ~10 minutes of inactivity — this aligns with the demo constraint
- One session per browser connection — close and re-open on reconnect

---

## Testing Without Track A (Stub System Prompt)

Until Track A delivers the real skill model, test with this hardcoded stub in `session_start` handling:

```typescript
// In startGeminiSession(), replace the assembleSystemPrompt call with:
systemInstruction = `You are coaching someone doing knife skills.
Watch their technique via camera (1 frame per second).
- Good grip: thumb and index finger pinch the spine 1 inch from the heel
- Common mistake: wrist drops during stroke
- Give specific, concise corrections. Be encouraging.
- Call log_observation for every piece of feedback.
- Call generate_annotation when you've corrected the same thing 3 times verbally.`;
```

---

## What Track E Needs From You

When Person C wires the frontend:
- WS server must be running at `ws://localhost:3001`
- It must accept the `session_start` message and respond with `{ type: "session_ready" }`
- It must accept `video_frame` messages silently (even if Live isn't wired yet)
- It must send `log_entry` messages when observations are logged

Minimal version for integration: `session_start` → `session_ready`, `video_frame` → no-op, manual `log_entry` emit on a timer (fake coaching for UI testing).
