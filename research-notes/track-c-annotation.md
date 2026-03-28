# Track C — Annotation (Nano Banana)
**Owner:** Person B or C — fully independent, no dependencies on other tracks
**Start:** Hour 0 — this is self-contained. Build and test it in isolation.
**Integration:** Track B calls `POST /api/annotate` when Gemini Live triggers `generate_annotation()`. Track E displays the returned image in the visual aid panel.

---

## What You're Building

When the coach needs to give a spatial correction (Tier 3 intervention), it:
1. Captures the current video frame from the user's webcam
2. POSTs that frame to `/api/annotate` along with what needs to be corrected
3. Your API sends it to Gemini's image generation ("Nano Banana") with a prompt to draw circles, arrows, and labels showing the corrected technique directly on the user's actual body
4. Returns the annotated image as a base64 data URI
5. The live-coaching UI shows it side-by-side with the original frame

This is the **"money shot"** of the whole product. A drawing on the user's *actual hands* showing exactly where their wrist should be.

---

## What Already Exists

| File | What it does |
|---|---|
| `lib/gemini.ts` | `getAI()` helper, `GEMINI_MODEL` constant — reuse these patterns |
| `package.json` | `@google/genai` (v1.46) already installed |

Nothing else exists for this track. You're building from scratch.

---

## Environment Variables

```bash
GEMINI_API_KEY=  # Required — same key used everywhere
```

---

## Task C1 — Build `/api/annotate` route

**New file:** `src/app/api/annotate/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  let frameBase64: string, correction: string, bodyPart: string;

  try {
    const body = await req.json();
    frameBase64 = body.frameBase64;
    correction = body.correction?.trim();
    bodyPart = body.bodyPart?.trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!frameBase64 || !correction) {
    return NextResponse.json({ error: "frameBase64 and correction required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    // Dev fallback — return a placeholder so the UI flow can be tested
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: `GEMINI_API_KEY not set — annotation skipped. Correction: ${correction}`,
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const annotationPrompt = buildAnnotationPrompt(correction, bodyPart);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17", // Nano Banana image generation model
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: frameBase64,
          },
        },
        { text: annotationPrompt },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // Extract the generated image
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
        const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        return NextResponse.json({ imageUrl, fallback: false });
      }
    }

    // Model responded but without an image
    console.warn("[annotate] Gemini returned no image in response");
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: "Annotation generation returned no image",
    });

  } catch (err: any) {
    console.error("[annotate] Generation error:", err?.message || err);
    // Non-fatal — the coach will narrate instead
    return NextResponse.json({
      imageUrl: null,
      fallback: true,
      message: err?.message || "Annotation failed",
    });
  }
}
```

---

## Task C2 — Annotation prompt engineering

This is the highest-risk part. The quality of the annotation depends entirely on this prompt. Test multiple versions.

**File:** `src/app/api/annotate/route.ts` — add this function

```typescript
function buildAnnotationPrompt(correction: string, bodyPart: string): string {
  return `You are a coaching AI. This is a real photo of a student practicing a skill.

Draw directly on this image to show them how to correct their technique:

CORRECTION NEEDED: ${correction}
FOCUS AREA: ${bodyPart || "the relevant body part or tool"}

Drawing instructions:
1. Draw a BRIGHT RED CIRCLE around the problem area (where the technique is currently wrong)
2. Draw a GREEN ARROW or indicator showing the correct position or direction of movement
3. Add a SHORT TEXT LABEL (2-5 words) in white text with a dark background explaining the correction
4. If there is an ideal position to show, draw a DASHED GREEN OUTLINE showing where the body part should be

Keep annotations minimal and clear — this will be viewed on a small screen during live practice.
Do NOT cover the student's face.
Do NOT add any coaching text outside the image — just the visual annotations on the image itself.

Return the annotated image.`;
}
```

**Prompt variations to test** — if the above produces messy results, try:

**Variation A — More explicit:**
```
Annotate this coaching image. Draw on it directly:
- Red circle: the specific part that is wrong (${bodyPart})
- Green arrow: pointing to where it should be
- White label with black shadow: "${correction}" in 3 words max
Keep annotations small and precise.
```

**Variation B — Minimal:**
```
Mark this technique error on the image:
Problem: ${correction}
Body part: ${bodyPart}
Use red for the error, green for the correction. Add a short label.
```

**Test these prompts early (Day 1)**. The annotation quality is demo-critical. Have all three variations ready so you can swap at demo time.

---

## Task C3 — Wire annotation display in the live-coaching UI

**File:** `src/app/live-coaching/page.tsx`

The `showVisualAid === "annotated"` state is already in the component. The visual aid panel already exists with a placeholder. You need to:

1. Add `annotatedFrameUrl` state (Track B may have already done this — check before duplicating)
2. Wire the annotated image into the existing panel

Find this block in the file (around line 220) and replace the placeholder with the real image:

```tsx
{showVisualAid === "annotated" && (
  <div className="flex-1 flex flex-col p-2 pt-12">
    <div className="flex-1 flex gap-2">
      {/* Original frame — show the "before" */}
      <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden group">
        {/* Keep existing placeholder or use live video still */}
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-white rounded">
          You
        </div>
      </div>

      {/* Annotated frame — your output */}
      <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden ring-2 ring-amber-500/50">
        {annotatedFrameUrl ? (
          <img
            src={annotatedFrameUrl}
            alt="Coaching annotation"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-zinc-500 text-center px-2">
              Generating annotation...
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-amber-400 rounded">
          Correction
        </div>
      </div>
    </div>

    {/* Dismiss button */}
    <button
      onClick={() => {
        setShowVisualAid("none");
        setAnnotatedFrameUrl(null);
      }}
      className="mt-3 text-xs text-zinc-500 hover:text-white text-center transition-colors"
    >
      Got it — dismiss
    </button>
  </div>
)}
```

---

## Testing the Annotation Route

Test with curl (use any JPEG base64 string):

```bash
# Quick test with a tiny placeholder image
curl -X POST http://localhost:3000/api/annotate \
  -H 'Content-Type: application/json' \
  -d '{"frameBase64":"<base64-jpeg>","correction":"wrist is dropping during the stroke","bodyPart":"wrist"}'
```

**Expected response (success):**
```json
{
  "imageUrl": "data:image/jpeg;base64,...",
  "fallback": false
}
```

**Expected response (no API key):**
```json
{
  "imageUrl": null,
  "fallback": true,
  "message": "GEMINI_API_KEY not set — annotation skipped..."
}
```

Test from the browser console during dev:
```javascript
// Capture current frame and test annotation
const video = document.querySelector('video');
const canvas = document.createElement('canvas');
canvas.width = 640; canvas.height = 480;
canvas.getContext('2d').drawImage(video, 0, 0, 640, 480);
const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

fetch('/api/annotate', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ frameBase64: b64, correction: 'wrist dropping during stroke', bodyPart: 'wrist' })
}).then(r => r.json()).then(d => {
  if (d.imageUrl) {
    const img = new Image();
    img.src = d.imageUrl;
    document.body.appendChild(img);
  }
});
```

---

## Fallback Strategy (Critical — Test This Early)

If Nano Banana doesn't produce clean annotations, the fallback is:

1. The API returns `{ imageUrl: null, fallback: true }`
2. In `track-b-live-session.md`, the WS server's `generate_annotation` handler already sends `annotation_request` to the browser
3. If browser receives `null` imageUrl, it **does NOT open the visual aid panel**
4. The coach's verbal description from Gemini Live audio handles the correction instead

Implement this fallback in `live-coaching/page.tsx`:
```typescript
case "annotation_request": {
  // ... capture frame, POST to /api/annotate ...
  const { imageUrl } = await res.json();
  if (imageUrl) {
    setAnnotatedFrameUrl(imageUrl);
    setShowVisualAid("annotated");
    // Also log it
    setCurrentTier(3);
  }
  // If imageUrl is null: do nothing. Coach's voice already explains it.
  break;
}
```

---

## Timing Notes

- Annotation generation takes **3-8 seconds** — this is expected
- In the coaching flow, Gemini Live says "Hold on, let me show you something" before calling `generate_annotation()`
- This natural pause covers the generation time
- The visual aid panel shows a "Generating annotation..." state while waiting
- On demo day: test the latency on the actual demo machine's network early

---

## Nano Banana Model Details

- **Model ID:** `gemini-2.5-flash-preview-04-17`
- **Config:** `responseModalities: ["IMAGE", "TEXT"]`
- Input: image `inlineData` + text prompt
- Output: look for `part.inlineData.data` in `response.candidates[0].content.parts`
- Same `GEMINI_API_KEY` as everything else — no separate billing/quota
- Free for hackathon use
