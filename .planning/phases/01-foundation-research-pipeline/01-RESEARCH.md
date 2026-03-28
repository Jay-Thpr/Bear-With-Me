# Phase 1: Foundation + Research Pipeline - Research

**Researched:** 2026-03-27
**Domain:** Next.js 14, Gemini API (search grounding + video analysis), YouTube Data API v3, Google Docs API, Node.js WebSocket server
**Confidence:** HIGH (stack is locked, APIs are well-documented, patterns verified against official sources)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | User can enter any skill name and trigger the research phase | Skill selection UI posts to a Next.js API route; route kicks off Gemini pipeline |
| RES-02 | System searches YouTube for technique tutorials using Gemini + Google Search grounding | Gemini `googleSearch` tool handles this natively; YouTube Data API v3 `search.list` as supplement |
| RES-03 | System analyzes tutorial video content to extract proper form, common mistakes, progression order | Gemini accepts YouTube URLs directly via `fileData.fileUri` — no upload needed for public videos |
| RES-04 | System generates structured skill document (form descriptions, ranked mistakes, progression steps, timestamps) | Prompt engineering task: output structured JSON or Markdown from Gemini synthesis call |
| RES-05 | Skill document saved to Google Docs | `googleapis` Docs API `documents.create` + `documents.batchUpdate` with service account auth |
| UI-01 | Skill selection / research phase screen | Simple Next.js App Router page with input + button + polling/streaming status display |
</phase_requirements>

---

## Summary

Phase 1 establishes the full research pipeline: user enters a skill name, the system finds relevant YouTube tutorials, analyzes video content for coaching knowledge, synthesizes a structured skill document, and writes it to Google Docs. The entire flow depends on three Google APIs (Gemini, YouTube Data API v3, Google Docs) all authenticated through the same service account.

The highest-risk element is **prompt engineering for the synthesis step** (RES-04). Gemini can pull real-time search results and analyze YouTube video content directly from URLs — but producing a _structured, coaching-quality_ skill document requires careful prompt design with explicit output schema. The research pipeline should be treated as a prompt engineering problem first, infrastructure problem second.

**Critical model awareness:** `gemini-2.0-flash` (the model named in the project brief) was deprecated as of March/June 2026. The current recommended model for text generation and search grounding is `gemini-2.5-flash`. Use `gemini-2.5-flash` for the research pipeline.

**Primary recommendation:** Use `@google/genai` SDK with `gemini-2.5-flash`, enable `googleSearch` grounding tool for YouTube discovery (RES-02), then make a second Gemini call with YouTube video URLs passed as `fileData.fileUri` for deep analysis (RES-03), then a third synthesis call to produce the structured doc (RES-04). Three-step pipeline, each step a distinct Gemini call.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 14.2.35 | Full-stack React framework | Locked decision — App Router, TypeScript, Tailwind all in one |
| typescript | 5.x (bundled) | Type safety | Locked decision |
| tailwindcss | 3.x (bundled) | Styling | Locked decision |
| @google/genai | 1.46.0 | Gemini API SDK | Official Google SDK, replaces `@google/generative-ai`; supports Gemini 2.5+ |
| googleapis | 171.4.0 | Google Docs/Drive/YouTube APIs | Official monorepo client; single dep covers all Google APIs |
| google-auth-library | 10.6.2 | Service account JWT auth | Used by googleapis internally; needed for explicit credential setup |
| ws | 8.20.0 | WebSocket server | Locked decision — Node.js `ws` for WebSocket alongside Next.js |
| dotenv | 17.3.1 | Env var loading for server | Standard for non-Next.js server processes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| concurrently | 9.2.1 | Run Next.js + WS server together | Dev script: `"dev": "concurrently \"next dev\" \"tsx server/index.ts\""` |
| tsx | 4.21.0 | Run TypeScript directly in Node | Replaces `ts-node` for server-side TypeScript execution; faster |
| nodemon | 3.1.14 | Watch + restart server on change | Wrap around tsx during dev for auto-reload |
| @types/ws | ^8 | TypeScript types for ws | Required when using ws in TypeScript |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google/genai` | `@google-cloud/aiplatform` (Vertex AI) | Vertex adds IAM complexity; Gemini Developer API is simpler for hackathon |
| googleapis Docs | REST fetch calls directly | googleapis handles OAuth token refresh automatically; don't hand-roll |
| YouTube Data API v3 | Gemini search grounding alone | YT API gives structured metadata (duration, channelId, viewCount); grounding gives broader context. Use both. |
| concurrently | npm workspaces + separate ports | Concurrently is simpler; fine for hackathon single-repo setup |

### Installation

```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir
npm install @google/genai googleapis google-auth-library ws dotenv
npm install -D concurrently tsx nodemon @types/ws
```

### Version verification (confirmed 2026-03-27)

```bash
npm view next@14 version     # -> 14.2.35
npm view @google/genai version  # -> 1.46.0
npm view googleapis version  # -> 171.4.0
npm view ws version          # -> 8.20.0
```

---

## Architecture Patterns

### Recommended Project Structure

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Root — skill selection UI (UI-01)
│   │   ├── layout.tsx            # Root layout
│   │   └── api/
│   │       └── research/
│   │           └── route.ts      # POST /api/research — triggers pipeline
├── server/
│   ├── index.ts                  # WebSocket server entry (Phase 2)
│   └── types.ts                  # Shared WS message types
├── lib/
│   ├── gemini.ts                 # Gemini client setup, pipeline functions
│   ├── youtube.ts                # YouTube Data API search helpers
│   ├── google-docs.ts            # Docs API create/write helpers
│   └── auth.ts                   # Service account auth setup
├── prompts/
│   └── skill-research.ts         # Prompt templates (keep out of lib/)
├── data/
│   └── cooking-skill-demo.json   # Pre-computed fallback (DEMO-03)
├── .env.local                    # Secrets (never committed)
└── package.json
```

### Pattern 1: Gemini Search Grounding (RES-02)

Use the `googleSearch` tool to let Gemini find relevant YouTube tutorials without manual YouTube API search. Grounding returns `groundingMetadata.groundingChunks` with source URLs you can extract.

```typescript
// Source: https://ai.google.dev/gemini-api/docs/google-search
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function findYouTubeTutorials(skill: string): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find the 5 best YouTube tutorial videos for learning "${skill}" technique.
               Focus on instructional content showing proper form and common mistakes.
               Return a JSON array of YouTube URLs only.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  // groundingMetadata.groundingChunks contains source URLs
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const youtubeUrls = chunks
    .map((c: any) => c.web?.uri)
    .filter((url: string) => url?.includes("youtube.com") || url?.includes("youtu.be"));

  return youtubeUrls;
}
```

### Pattern 2: YouTube Video Analysis via URL (RES-03)

Gemini accepts public YouTube URLs directly in `fileData.fileUri` — no download or upload required. Pass multiple URLs in one call (Gemini 2.5 supports up to 10 videos per request).

```typescript
// Source: https://ai.google.dev/gemini-api/docs/video-understanding
async function analyzeVideos(skill: string, videoUrls: string[]): Promise<string> {
  const videoContents = videoUrls.slice(0, 5).map((url) => ({
    fileData: { fileUri: url },
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      ...videoContents,
      {
        text: `You are analyzing tutorial videos for teaching "${skill}".
               Extract:
               1. Proper form/technique steps (ordered list)
               2. Common mistakes beginners make (ranked by frequency)
               3. Progression milestones (beginner → intermediate → advanced)
               4. Key timestamps with what they demonstrate

               Return valid JSON matching this schema:
               { "techniqueSteps": string[], "commonMistakes": { "mistake": string, "correction": string }[], "progressionSteps": string[], "keyTimestamps": { "url": string, "timestamp": string, "description": string }[] }`,
      },
    ],
  });

  return response.text ?? "";
}
```

### Pattern 3: Service Account Auth (for Google Docs API)

```typescript
// Source: https://developers.google.com/workspace/docs/api
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";

function getGoogleAuth() {
  // credentials.json must be downloaded from Google Cloud Console
  // Service account must have Docs/Drive API enabled and be shared on target folder
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, // path to credentials.json
    // OR: credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

async function createSkillDoc(title: string, content: string): Promise<string> {
  const auth = getGoogleAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  // 1. Create empty doc
  const createRes = await docs.documents.create({ requestBody: { title } });
  const docId = createRes.data.documentId!;

  // 2. Move to target folder (optional, requires Drive scope)
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
    await drive.files.update({
      fileId: docId,
      addParents: process.env.GOOGLE_DRIVE_FOLDER_ID,
      requestBody: {},
    });
  }

  // 3. Write content via batchUpdate
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content,
          },
        },
      ],
    },
  });

  return `https://docs.google.com/document/d/${docId}`;
}
```

### Pattern 4: Research Pipeline Orchestration (API Route)

```typescript
// src/app/api/research/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { skill } = await req.json();
  if (!skill) return NextResponse.json({ error: "skill required" }, { status: 400 });

  try {
    // Step 1: Search grounding finds YouTube URLs
    const videoUrls = await findYouTubeTutorials(skill);

    // Step 2: Analyze video content
    const rawAnalysis = await analyzeVideos(skill, videoUrls);

    // Step 3: Synthesize into structured skill doc
    const skillDoc = await synthesizeSkillDoc(skill, rawAnalysis);

    // Step 4: Write to Google Docs
    const docUrl = await createSkillDoc(`${skill} — Skill Model`, skillDoc);

    return NextResponse.json({ success: true, docUrl, skillDoc });
  } catch (err) {
    console.error("[research] pipeline error:", err);
    return NextResponse.json({ error: "Research pipeline failed" }, { status: 500 });
  }
}
```

### Pattern 5: Concurrently Dev Script

```json
// package.json
{
  "scripts": {
    "dev": "concurrently -k -n \"next,ws\" \"next dev\" \"tsx watch server/index.ts\"",
    "dev:next": "next dev",
    "dev:ws": "tsx watch server/index.ts",
    "build": "next build",
    "start": "next start"
  }
}
```

### Anti-Patterns to Avoid

- **Using `gemini-2.0-flash` model string:** It is deprecated and shuts down June 1, 2026. Use `gemini-2.5-flash`.
- **Uploading YouTube videos via Files API:** Unnecessary for public videos. Pass YouTube URLs directly via `fileData.fileUri`.
- **Putting all 3 pipeline steps in one Gemini call:** The context gets muddied. Separate calls for (1) discover, (2) analyze, (3) synthesize produce better, debuggable results.
- **Storing service account JSON in the repo:** Use `.env.local` with `GOOGLE_SERVICE_ACCOUNT_JSON` or a file path pointing outside the repo.
- **Inserting text at index 0 in Docs API:** Index 0 is before the paragraph marker. Always insert at index 1. Inserting at 0 throws an error.
- **Writing one giant insertText request:** For long documents, break into multiple batchUpdate requests or use newline-delimited text in one insertText — the Docs API has a request size limit.
- **Running `next dev` and the WS server on the same port:** Next defaults to 3000, WS server should use 3001 (or any other port). Set `PORT=3001` in server/index.ts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini authentication | Manual JWT token generation | `@google/genai` SDK (`GoogleGenAI`) | SDK handles API key, retries, error types |
| Google Workspace auth | Manual service account JWT | `googleapis` with `google.auth.GoogleAuth` | Token refresh, scope handling, all managed |
| YouTube video discovery | Custom YouTube search parser | Gemini `googleSearch` grounding tool | Grounding handles search intent, ranking, real-time data |
| YouTube video download/processing | FFmpeg pipeline, frame extraction | Gemini `fileData.fileUri` with YouTube URL | Gemini processes video server-side, no download needed |
| Structured doc parsing | JSON regex from LLM output | Prompt with explicit JSON schema + `JSON.parse` | Ask Gemini to output strict JSON, validate at parse time |
| Docs API text formatting | Custom Markdown-to-Docs converter | Write plain text with `\n` newlines | Hackathon constraint — formatted headings via `updateParagraphStyle` are complex; plain text is sufficient |

**Key insight:** The entire research pipeline is API orchestration, not custom algorithm work. The only custom code is prompt templates and the pipeline glue.

---

## Common Pitfalls

### Pitfall 1: Model Deprecation (CRITICAL)

**What goes wrong:** Code uses `gemini-2.0-flash` — this model was deprecated in March 2026 and shuts down June 1, 2026. API calls fail with 404 or model-not-found errors.
**Why it happens:** Project brief was written when 2.0-flash was current; the Gemini model landscape moved fast in early 2026.
**How to avoid:** Use `gemini-2.5-flash` throughout. Confirmed as the current recommended successor. Add model name to a single constant (e.g., `lib/gemini.ts` exports `GEMINI_MODEL = "gemini-2.5-flash"`) so it's easy to update.
**Warning signs:** 404 errors, "model not found" messages from Gemini API.

### Pitfall 2: YouTube Video Access — Private/Unlisted Videos

**What goes wrong:** Gemini refuses to analyze a YouTube URL passed as `fileData.fileUri`.
**Why it happens:** Gemini only processes public YouTube videos. Unlisted or private videos return an error.
**How to avoid:** When searching for tutorials, rely on grounding search results (which surface public videos). Don't pass arbitrary URLs. Wrap video analysis in try/catch and skip failed URLs.
**Warning signs:** "Unable to access video" or permission errors from Gemini video analysis calls.

### Pitfall 3: YouTube Data API Quota Exhaustion

**What goes wrong:** `search.list` calls hit the 10,000 unit/day default quota. Each `search.list` call costs 100 units — that's only 100 searches per day.
**Why it happens:** YouTube Data API v3 quota is per project, shared across all API key usage.
**How to avoid:** Use Gemini search grounding as the PRIMARY discovery mechanism (RES-02). YouTube Data API is optional supplemental enrichment. If used, keep search calls to a minimum (1-2 per research session).
**Warning signs:** `quotaExceeded` error from YouTube API. Fallback: use only Gemini grounding results.

### Pitfall 4: Google Docs API — Service Account Can't Write to Your Docs

**What goes wrong:** Docs API returns 403 when the service account tries to create or write a document.
**Why it happens:** Service accounts are separate Google identities. They can only write to files they own or that are explicitly shared with them.
**How to avoid:** Two options: (a) let the service account create new docs (it owns them, can write freely), then share the doc link with the demo user; OR (b) pre-create a shared Drive folder, share it with the service account email, and use `drive.files.update` to move new docs into it. Option (a) is simpler for hackathon.
**Warning signs:** 403 "The caller does not have permission" errors.

### Pitfall 5: Gemini Grounding Returns Non-YouTube URLs

**What goes wrong:** `groundingChunks` contains general web URLs, not YouTube links.
**Why it happens:** Search grounding searches the whole web, not just YouTube.
**How to avoid:** Filter `groundingChunks` for URLs containing `youtube.com` or `youtu.be`. If < 3 YouTube URLs found from grounding, fall back to YouTube Data API `search.list` with `type=video`.
**Warning signs:** `videoUrls` array empty or full of non-video URLs.

### Pitfall 6: Shallow Skill Document from Gemini (Highest Risk)

**What goes wrong:** Gemini produces a generic, shallow skill doc — "hold the knife firmly, keep your fingers safe" — not a coaching-quality document with specific technique cues.
**Why it happens:** Default prompts produce average-quality outputs. The research pipeline quality is entirely determined by prompt design.
**How to avoid:** (1) Specify output JSON schema explicitly in the prompt. (2) Ask for _specific_ technique observations from the videos (e.g., "wrist position during the cut, not just 'use proper form'"). (3) Instruct Gemini to identify _observable_ mistakes that a camera could detect. (4) Test prompt with cooking/knife skills before demo.
**Warning signs:** Skill doc reads like a Wikipedia article, not a coaching manual.

### Pitfall 7: Docs API `insertText` at Index 0

**What goes wrong:** `batchUpdate` with `insertText` at `location: { index: 0 }` throws an error.
**Why it happens:** Index 0 precedes the document's first paragraph marker, which is a reserved position.
**How to avoid:** Always use `location: { index: 1 }` for inserting at the beginning of a new document.
**Warning signs:** "Invalid index" or "Index out of bounds" errors from Docs API.

---

## Code Examples

### Full Three-Step Research Pipeline Sketch

```typescript
// lib/gemini.ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
export const GEMINI_MODEL = "gemini-2.5-flash"; // single source of truth

// Step 1: Find YouTube tutorial URLs via grounding
export async function findTutorialUrls(skill: string): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: { tools: [{ googleSearch: {} }] },
    contents: `Find 5 high-quality YouTube tutorial videos teaching "${skill}" technique.
               Prefer instructional videos showing hands-on demonstration with clear form cues.
               Return ONLY a JSON array of YouTube video URLs, e.g.: ["https://youtube.com/watch?v=...", ...]`,
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map((c: any) => c.web?.uri as string)
    .filter((url) => url?.includes("youtube.com/watch") || url?.includes("youtu.be/"))
    .slice(0, 5);
}

// Step 2: Analyze video content for coaching data
export async function analyzeSkillVideos(skill: string, urls: string[]): Promise<string> {
  if (urls.length === 0) throw new Error("No video URLs to analyze");

  const videoContents = urls.slice(0, 5).map((url) => ({ fileData: { fileUri: url } }));

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      ...videoContents,
      {
        text: `Analyze these ${skill} tutorial videos. You are building a coaching AI that will watch
               a student via webcam and give real-time corrections.

               Extract exactly this JSON structure:
               {
                 "skill": "${skill}",
                 "techniqueSteps": ["step 1 with specific body/tool positioning", ...],
                 "commonMistakes": [
                   { "mistake": "observable description", "correction": "specific fix", "severity": "high|medium|low" }
                 ],
                 "progressionMilestones": ["milestone 1", "milestone 2", "milestone 3"],
                 "keyTimestamps": [
                   { "videoUrl": "url", "timestamp": "MM:SS", "coachingNote": "what to look for here" }
                 ]
               }

               CRITICAL: All mistakes must be OBSERVABLE from a camera (position, angle, grip, posture).
               Not "don't rush" — instead "wrist drops below cutting board level during stroke".`,
      },
    ],
  });

  return response.text ?? "";
}

// Step 3: Synthesize into a final structured skill document
export async function synthesizeSkillDoc(rawAnalysis: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Given this raw video analysis data, produce a clean, structured coaching skill document.
               Format as plain text with clear section headers (use ALL CAPS headers).
               Raw analysis: ${rawAnalysis}

               Output sections: SKILL OVERVIEW, TECHNIQUE STEPS, COMMON MISTAKES AND CORRECTIONS,
               PROGRESSION MILESTONES, KEY VIDEO REFERENCES`,
  });

  return response.text ?? "";
}
```

### Google Auth Setup

```typescript
// lib/auth.ts
import { google } from "googleapis";

export function getGoogleAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!keyFile && !keyJson) {
    throw new Error("Missing Google service account credentials in env");
  }

  return new google.auth.GoogleAuth({
    ...(keyFile ? { keyFile } : { credentials: JSON.parse(keyJson!) }),
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}
```

### Skill Selection UI (UI-01)

```tsx
// src/app/page.tsx — simplified
"use client";
import { useState } from "react";

export default function SkillSelectionPage() {
  const [skill, setSkill] = useState("");
  const [status, setStatus] = useState<"idle" | "researching" | "done" | "error">("idle");
  const [docUrl, setDocUrl] = useState<string | null>(null);

  async function handleResearch() {
    setStatus("researching");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      const data = await res.json();
      if (data.docUrl) {
        setDocUrl(data.docUrl);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">What do you want to learn?</h1>
      <input
        className="border rounded px-4 py-2 w-80 text-lg"
        placeholder="e.g. knife skills, juggling, golf swing"
        value={skill}
        onChange={(e) => setSkill(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleResearch()}
      />
      <button
        className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        onClick={handleResearch}
        disabled={!skill || status === "researching"}
      >
        {status === "researching" ? "Researching..." : "Start Research"}
      </button>
      {status === "done" && docUrl && (
        <a href={docUrl} target="_blank" className="text-blue-500 underline">
          View Skill Document in Google Docs
        </a>
      )}
      {status === "error" && (
        <p className="text-red-500">Research failed. Check console.</p>
      )}
    </main>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gemini-2.0-flash` | `gemini-2.5-flash` | March 2026 (deprecation) | 2.0 models shut down June 1, 2026 — must use 2.5 |
| `@google/generative-ai` npm package | `@google/genai` npm package | 2024-2025 | New SDK is the official replacement with Gemini 2.x+ support |
| Upload video to Files API before analysis | Pass YouTube URL directly via `fileData.fileUri` | Gemini 1.5+ | Eliminates download+upload step for public YouTube videos |
| Separate YouTube search + Gemini analysis | Gemini search grounding tool finds AND cites YouTube | 2024 | One call discovers relevant videos; grounding handles relevance ranking |
| `google_search_retrieval` tool name | `googleSearch` tool name | Gemini 2.0+ SDK | Old tool name still works but new SDK uses `googleSearch` |
| Next.js 14 as "latest" | Next.js 16 is latest, but Next.js 14 is the locked decision | 2025 | Use `create-next-app@14` explicitly to avoid defaulting to Next.js 16 |

**Deprecated/outdated:**
- `gemini-2.0-flash`: Deprecated March 2026, shutdown June 1, 2026
- `gemini-2.5-flash` (original): Shutting down June 17, 2026 — use the latest stable variant
- `@google/generative-ai`: Superseded by `@google/genai` for Gemini 2.x+ features

---

## Open Questions

1. **Which exact `gemini-2.5-flash` model string to use**
   - What we know: `gemini-2.5-flash` is the canonical name; the API may auto-route to the latest stable version
   - What's unclear: Whether to pin to a specific version tag (e.g., `gemini-2.5-flash-001`) for stability vs. `gemini-2.5-flash` for latest
   - Recommendation: Start with `gemini-2.5-flash` (no version pin). If API returns unexpected behavior, check the deprecations page and pin to the latest stable version.

2. **Research pipeline latency vs. demo flow**
   - What we know: Three Gemini calls (discover → analyze → synthesize) will take 15-40 seconds total; video analysis is the slowest step
   - What's unclear: Whether the UI should show step-by-step progress or just a spinner
   - Recommendation: Show step-by-step status ("Finding tutorials... Analyzing videos... Writing document...") — it makes the demo more legible and impressive. Use streaming or polling from the API route.

3. **Grounding search quota**
   - What we know: First 1,500 grounding queries/day are free on paid tiers; $35/1,000 after
   - What's unclear: Whether grounding calls count toward the Gemini API free tier or have separate limits
   - Recommendation: For hackathon, assume paid tier. Keep research pipeline calls to 1-2 grounding searches per skill (not per video). Monitor usage in Google AI Studio console.

4. **YouTube URL reliability from grounding**
   - What we know: Grounding returns web URLs from Google Search; YouTube videos are commonly indexed
   - What's unclear: How reliably grounding returns YouTube video URLs vs. other video platforms or articles
   - Recommendation: Implement the YouTube Data API fallback (Pattern: if grounding returns < 3 YouTube URLs, call `youtube.search.list` with `q="${skill} tutorial"` and `type=video`). Test with cooking/knife skills specifically before demo.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 14 (min 18.17), ts server | Yes | v24.11.0 | — |
| npm | Package installation | Yes | 11.6.1 | — |
| Google Cloud project + service account | Docs API, Drive API | Not verified | — | Must be set up manually — see setup notes |
| Gemini API key | All Gemini calls | Not verified | — | Must be obtained from Google AI Studio |
| YouTube Data API key | Fallback video search | Not verified | — | Can skip if grounding returns enough URLs |
| Google Docs API enabled | Docs writes | Not verified | — | Must be enabled in Google Cloud Console |

**Missing dependencies with no fallback:**
- Service account credentials JSON — must be downloaded from Google Cloud Console and stored locally
- Gemini API key — must be obtained from [Google AI Studio](https://aistudio.google.com/)

**Missing dependencies with fallback:**
- YouTube Data API key — grounding can cover discovery; YT API is supplemental for enrichment only

**Service account setup steps (manual, one-time):**
1. Create/use a Google Cloud project
2. Enable: Gemini API, Google Docs API, Google Drive API, YouTube Data API v3
3. Create a service account under IAM & Admin
4. Download JSON key file → store as `credentials/service-account.json` (git-ignored)
5. Add `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json` to `.env.local`
6. Add `GEMINI_API_KEY=...` to `.env.local`
7. Add `YOUTUBE_API_KEY=...` to `.env.local` (optional)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Wave 0 must install Jest or Vitest |
| Config file | None — see Wave 0 |
| Quick run command | `npm test` (after Wave 0 setup) |
| Full suite command | `npm test -- --run` (Vitest) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RES-01 | POST /api/research returns 200 with docUrl | integration | `vitest run tests/api/research.test.ts` | No — Wave 0 |
| RES-02 | `findTutorialUrls` returns ≥1 YouTube URL | unit (mock Gemini) | `vitest run tests/lib/gemini.test.ts` | No — Wave 0 |
| RES-03 | `analyzeSkillVideos` returns parseable JSON with required keys | unit (mock Gemini) | `vitest run tests/lib/gemini.test.ts` | No — Wave 0 |
| RES-04 | Synthesized doc contains all required sections | unit (mock Gemini) | `vitest run tests/lib/gemini.test.ts` | No — Wave 0 |
| RES-05 | `createSkillDoc` calls Docs API create + batchUpdate | unit (mock googleapis) | `vitest run tests/lib/google-docs.test.ts` | No — Wave 0 |
| UI-01 | Skill selection page renders, input and button present | component | `vitest run tests/components/SkillSelection.test.tsx` | No — Wave 0 |

**Note:** Given the 24-hour hackathon constraint, formal test files are LOW priority. The manual smoke test is the real gate: run the pipeline end-to-end with "knife skills" and verify a Google Doc appears.

### Sampling Rate
- **Per task commit:** Manual smoke test — run research pipeline with "knife skills"
- **Per wave merge:** Manual end-to-end — research → doc exists in Google Docs
- **Phase gate:** Live demo rehearsal with cooking skill doc visible before advancing to Phase 2

### Wave 0 Gaps
- [ ] `vitest` config — `npm install -D vitest @vitejs/plugin-react` + `vitest.config.ts`
- [ ] `tests/lib/gemini.test.ts` — covers RES-02, RES-03, RES-04 with mocked `@google/genai`
- [ ] `tests/lib/google-docs.test.ts` — covers RES-05 with mocked `googleapis`
- [ ] `tests/api/research.test.ts` — covers RES-01 via Next.js route handler test

---

## Sources

### Primary (HIGH confidence)
- [Gemini API Google Search Grounding](https://ai.google.dev/gemini-api/docs/google-search) — googleSearch tool API, model names, grounding metadata fields
- [Gemini API Video Understanding](https://ai.google.dev/gemini-api/docs/video-understanding) — YouTube URL fileData.fileUri pattern, video count limits
- [Gemini API Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) — 2.0-flash shutdown date, 2.5-flash replacement
- [Next.js Installation Docs](https://nextjs.org/docs/app/getting-started/installation) — create-next-app flags, minimum Node.js version
- [YouTube Data API v3 search.list](https://developers.google.com/youtube/v3/docs/search/list) — search parameters, quota costs (100 units/call)
- [Google Docs API create/batchUpdate](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate) — document creation and insertText patterns

### Secondary (MEDIUM confidence)
- npm registry version verification (2026-03-27): `next@14.2.35`, `@google/genai@1.46.0`, `googleapis@171.4.0`, `ws@8.20.0`
- [WebSocket + Next.js concurrently pattern](https://blog.designly.biz/roll-your-own-real-time-chat-server-with-next-js-and-websockets) — verified against npm concurrently docs

### Tertiary (LOW confidence)
- WebSearch results on Gemini 2.5-flash stability — Google's deprecation page is the authoritative source, not blog posts
- Model name `gemini-2.5-flash` for current recommendation — confirmed on deprecations page but exact stable version string should be verified in AI Studio before coding

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-03-27
- Architecture: HIGH — patterns verified against official Gemini and Google Workspace API docs
- Pitfalls: HIGH (model deprecation, Docs API index) — verified against official sources; MEDIUM (grounding URL quality, shallow docs) — based on known LLM behavior patterns
- Gemini model name: MEDIUM — `gemini-2.5-flash` confirmed as replacement for 2.0-flash, but "latest stable" tag behavior should be verified in AI Studio

**Research date:** 2026-03-27
**Valid until:** 2026-04-10 (Gemini model landscape is moving fast; recheck in 2 weeks)
