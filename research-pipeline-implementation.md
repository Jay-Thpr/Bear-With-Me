# Research Pipeline — Full Implementation Guide

This document specifies every detail needed to implement the research pipeline: from a user selecting a new skill through to a fully populated Google Doc containing the structured skill model, ready for injection into a Gemini Live coaching session.

---

## Tech Stack

| Layer | Technology | Package/Version |
|---|---|---|
| Runtime | Node.js 20+ | — |
| Framework | Next.js 14+ (App Router) | `next` |
| Language | TypeScript | `typescript` |
| Gemini SDK | Google GenAI SDK | `@google/genai` (latest) |
| Google Workspace | googleapis | `googleapis` (npm) |
| Auth | Google OAuth 2.0 | `googleapis` built-in auth |
| State | React state + server actions | — |
| Image Gen | Nano Banana via Gemini API | `@google/genai` |

### Required API Keys & Credentials

1. **Gemini API Key** — from Google AI Studio (https://aistudio.google.com/apikey)
   - Used for: Gemini text generation, search grounding, YouTube understanding, Nano Banana image generation
   - Env var: `GEMINI_API_KEY`

2. **Google OAuth 2.0 Client** — from Google Cloud Console
   - Used for: Google Docs API, Google Calendar API, Google Drive API
   - Required scopes:
     ```
     https://www.googleapis.com/auth/documents
     https://www.googleapis.com/auth/calendar
     https://www.googleapis.com/auth/drive.file
     ```
   - Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

3. **Google Cloud Project** — enable these APIs in the Cloud Console:
   - Google Docs API
   - Google Calendar API
   - Google Drive API

---

## Pipeline Overview

```
STEP 1: User Input
  User types skill + selects level + sets goal
    ↓
STEP 2: User Preference Interview
  Gemini asks 2-3 questions to understand HOW to teach this user
    ↓
STEP 3: Skill Illustration Generation
  Nano Banana generates a visual icon for this skill
    ↓
STEP 4: Web Research
  Gemini + Google Search grounding researches the skill
    ↓
STEP 5: YouTube Tutorial Discovery & Analysis
  Gemini finds and deeply analyzes relevant tutorial videos
    ↓
STEP 6: Skill Model Synthesis
  Gemini synthesizes all research into structured skill model JSON
    ↓
STEP 7: Calendar Context Pull
  Check user's calendar for availability, time constraints
    ↓
STEP 8: Save to Google Docs
  Create/update a Google Doc with the full skill model
    ↓
STEP 9: Prepare Session Context
  Assemble the system prompt for the Live API session
    ↓
OUTPUT: Ready for Live Session
```

---

## STEP 1: User Input Collection

### What you collect from the UI

```typescript
interface SkillSelectionInput {
  skill: string;            // Free text: "knife skills", "basketball free throw", "watercolor washes"
  goal: string;             // Free text: "learn the rocking cut technique"
  skillLevel: "beginner" | "intermediate" | "advanced";
  contextSources: {
    youtube: boolean;        // default: true
    docs: boolean;           // default: true
    calendar: boolean;       // default: true
  };
}
```

This comes from the Session Prep screen. The user has typed a skill, set their level, described their goal, and toggled their context sources.

---

## STEP 2: User Preference Interview

### Purpose

Before researching, the system asks the user 2-3 quick questions to understand their learning style, any constraints, and what specifically about the skill matters to them. This ensures the research is targeted, not generic.

### Implementation

Use a single Gemini API call with structured output to generate the interview questions, then a second call to process the answers into teaching preferences.

#### Step 2a: Generate interview questions

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateInterviewQuestions(input: SkillSelectionInput): Promise<InterviewQuestions> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are preparing to coach someone in "${input.skill}".
Their stated goal is: "${input.goal}"
Their experience level: ${input.skillLevel}

Generate exactly 3 short interview questions to understand HOW to teach them best.
Focus on:
1. Their specific context/constraints (e.g., what equipment do they have, how much time, any physical limitations)
2. Their learning style preference (visual demonstrations vs verbal explanations vs hands-on trial-and-error)
3. What success looks like to them for this specific goal

Return ONLY a JSON object with this exact structure, no other text:
{
  "questions": [
    {
      "id": "q1",
      "question": "the question text",
      "type": "multiple_choice" | "free_text",
      "options": ["option1", "option2", "option3"] // only if multiple_choice
    }
  ]
}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
}
```

#### Example output for "knife skills - rocking cut - beginner":

```json
{
  "questions": [
    {
      "id": "q1",
      "question": "What kind of knife do you have?",
      "type": "multiple_choice",
      "options": ["Chef's knife (8-10 inch)", "Santoku", "Small utility knife", "Not sure"]
    },
    {
      "id": "q2",
      "question": "How do you learn best?",
      "type": "multiple_choice",
      "options": ["Show me a video first, then I try", "Let me try and correct me as I go", "Explain the theory, then I practice"]
    },
    {
      "id": "q3",
      "question": "What does success look like for you today?",
      "type": "free_text"
    }
  ]
}
```

#### Step 2b: Process answers into teaching preferences

After the user answers the questions in the UI, process them:

```typescript
interface InterviewAnswer {
  questionId: string;
  answer: string;
}

interface TeachingPreferences {
  equipmentContext: string;
  learningStyle: string;
  successCriteria: string;
  teachingApproach: string;
}

async function processInterviewAnswers(
  input: SkillSelectionInput,
  questions: InterviewQuestions,
  answers: InterviewAnswer[]
): Promise<TeachingPreferences> {
  const qaText = questions.questions.map((q, i) => {
    const answer = answers.find(a => a.questionId === q.id);
    return `Q: ${q.question}\nA: ${answer?.answer || "No answer"}`;
  }).join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Based on this interview with a ${input.skillLevel} student wanting to learn "${input.skill}" with goal "${input.goal}":

${qaText}

Synthesize their preferences into a teaching strategy. Return ONLY a JSON object:
{
  "equipmentContext": "what they have and any constraints",
  "learningStyle": "how they prefer to learn",
  "successCriteria": "what they want to achieve",
  "teachingApproach": "how you should structure coaching for this person - be specific about pacing, correction frequency, and whether to demo first or let them try first"
}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
}
```

### UI behavior during this step

- The interview questions appear as a quick interactive form on the Session Prep screen — NOT a separate screen
- Multiple choice questions render as tappable chips/buttons
- Free text questions render as a short text input
- Total interaction time: 10-15 seconds
- After answers are submitted, immediately proceed to Step 3 (illustration) and Step 4 (research) in parallel

---

## STEP 3: Skill Illustration Generation

### Purpose

Generate a Nano Banana illustration that becomes the visual identity for this skill throughout the app.

### Implementation

```typescript
async function generateSkillIllustration(skill: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-04-17", // Nano Banana model
    contents: `Create a minimal, stylized illustration representing the skill: "${skill}".

Requirements:
- Square format, clean composition
- Warm, inviting color palette
- No text in the image
- Simple enough to work as a small icon (64x64px) but detailed enough at larger sizes
- Show the essential visual element of the skill (hands, tools, body position)
- Stylized, not photorealistic — think app icon aesthetic`,
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  // Extract the image from the response
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      // Save image to Google Drive or local storage
      const imageBuffer = Buffer.from(part.inlineData.data, "base64");
      const imageUrl = await saveImageToDrive(imageBuffer, `skill-${skill}.png`);
      return imageUrl;
    }
  }

  throw new Error("No image generated");
}
```

### Notes

- This runs in PARALLEL with the research steps (Steps 4-5) to avoid blocking
- Generation takes ~3-8 seconds
- The UI shows a placeholder shimmer in the skill card while this generates
- Once generated, the image is stored and reused for all future sessions with this skill
- If generation fails, fall back to a generic icon based on skill category

---

## STEP 4: Web Research via Google Search Grounding

### Purpose

Use Gemini with built-in Google Search grounding to research the skill's fundamentals, proper technique, common mistakes, and progression structure.

### Implementation

```typescript
interface WebResearchResult {
  fundamentals: string;
  properForm: Record<string, string>;
  commonMistakes: Array<{ issue: string; severity: string; correction: string }>;
  progressionSteps: string[];
  safetyConsiderations: string[];
  sources: Array<{ title: string; url: string }>;
}

async function conductWebResearch(
  skill: string,
  goal: string,
  level: string,
  preferences: TeachingPreferences
): Promise<WebResearchResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are researching how to coach someone in "${skill}" with the specific goal: "${goal}".
Student level: ${level}
Equipment/context: ${preferences.equipmentContext}

Research this skill thoroughly using Google Search. I need you to find:

1. FUNDAMENTALS: The core technique elements that define proper form for this skill
2. PROPER FORM: Specific, observable body positions/movements/actions that constitute correct technique. Be extremely precise — describe things a camera could see (e.g., "thumb and index finger pinch the blade spine 1 inch from the heel" not "hold the knife correctly")
3. COMMON MISTAKES: The most frequent errors beginners/intermediates make, ranked by severity. For each, describe what the mistake looks like (observable) and the specific correction
4. PROGRESSION: The recommended learning order — what to master first before moving to the next step. Typically 4-6 stages.
5. SAFETY: Any safety considerations specific to this skill

Return ONLY a JSON object with this exact structure:
{
  "fundamentals": "2-3 sentence overview of the core technique",
  "properForm": {
    "aspect_name": "precise, observable description of correct form for this aspect"
  },
  "commonMistakes": [
    {
      "issue": "what the mistake looks like (observable)",
      "severity": "high | medium | low",
      "correction": "specific action to fix it"
    }
  ],
  "progressionSteps": ["step 1", "step 2", "..."],
  "safetyConsiderations": ["consideration 1", "..."],
  "sources": [
    { "title": "source title", "url": "source url" }
  ]
}`,
    config: {
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
    },
  });

  const result = JSON.parse(response.text);

  // Also extract grounding metadata for source attribution
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  if (groundingMetadata?.groundingChunks) {
    result.sources = groundingMetadata.groundingChunks
      .filter(chunk => chunk.web)
      .map(chunk => ({
        title: chunk.web.title,
        url: chunk.web.uri,
      }));
  }

  return result;
}
```

### What the search grounding does behind the scenes

When you pass `tools: [{ googleSearch: {} }]`, Gemini automatically:
1. Generates search queries based on your prompt (e.g., "proper knife rocking cut technique", "common knife skills mistakes beginners")
2. Executes those searches against Google Search
3. Reads and synthesizes the results
4. Returns a response grounded in actual web content, with citations

You don't need to construct search queries yourself — the model handles this. The `groundingMetadata` in the response gives you the actual sources used.

### Frontend updates during this step

Push real-time updates to the Research Loading screen:

```typescript
// Server-sent events or WebSocket to push status updates
function emitResearchStatus(status: string) {
  // Push to frontend: "🔍 Searching for rocking cut technique..."
  // Push to frontend: "✅ Proper form identified: pinch grip, curved blade motion"
  // etc.
}
```

---

## STEP 5: YouTube Tutorial Discovery & Analysis

### Purpose

Find the most relevant tutorial videos for this skill, then deeply analyze them to extract specific technique demonstrations with timestamps.

### Step 5a: Discover relevant YouTube tutorials

Use Gemini with search grounding to find the best YouTube tutorials:

```typescript
interface YouTubeDiscoveryResult {
  videos: Array<{
    url: string;
    title: string;
    whyRelevant: string;
  }>;
}

async function discoverYouTubeTutorials(
  skill: string,
  goal: string,
  level: string
): Promise<YouTubeDiscoveryResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find the 3 best YouTube tutorial videos for learning "${skill}", specifically "${goal}" at the ${level} level.

Prioritize:
- Videos from recognized experts or professional instructors
- Videos with clear visual demonstrations (not just talking head)
- Videos that are 3-15 minutes long (not too short, not too long)
- Videos published within the last 5 years

Return ONLY a JSON object:
{
  "videos": [
    {
      "url": "full YouTube URL",
      "title": "video title",
      "whyRelevant": "why this video is good for this student's goal"
    }
  ]
}`,
    config: {
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
    },
  });

  return JSON.parse(response.text);
}
```

### Step 5b: Deep analysis of each tutorial video

This is the powerful part. Gemini can accept a YouTube URL directly and analyze the video content — both visual and audio:

```typescript
interface VideoAnalysis {
  url: string;
  title: string;
  overallSummary: string;
  keyTechniques: Array<{
    technique: string;
    timestamp: string;
    description: string;
    visualCues: string;
  }>;
  commonMistakesShown: Array<{
    mistake: string;
    timestamp: string;
    correction: string;
  }>;
  bestMomentsForReference: Array<{
    timestamp: string;
    description: string;
    useCase: string;
  }>;
}

async function analyzeYouTubeVideo(
  videoUrl: string,
  skill: string,
  goal: string
): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        fileData: {
          fileUri: videoUrl,
          mimeType: "video/mp4",
        },
      },
      {
        text: `You are analyzing this tutorial video to prepare for coaching someone in "${skill}" with goal "${goal}".

Watch this video carefully and extract:

1. KEY TECHNIQUES: Every distinct technique demonstrated. For each, note the exact timestamp (MM:SS), what the technique is, a precise description of the proper form shown, and what visual cues to look for (what does it LOOK like when done correctly)

2. COMMON MISTAKES: If the instructor shows or discusses common mistakes, note the timestamp, what the mistake is, and the correction

3. BEST MOMENTS FOR REFERENCE: The 2-3 best moments in this video that could be shown to a student during a live coaching session. These should be clear, concise demonstrations of technique — moments where you'd say "pause, watch this part"

Return ONLY a JSON object:
{
  "url": "${videoUrl}",
  "title": "video title as shown",
  "overallSummary": "2-3 sentence summary of what this video teaches",
  "keyTechniques": [
    {
      "technique": "name of technique",
      "timestamp": "MM:SS",
      "description": "what proper form looks like here",
      "visualCues": "what to look for visually when coaching"
    }
  ],
  "commonMistakesShown": [
    {
      "mistake": "what the mistake is",
      "timestamp": "MM:SS",
      "correction": "what the instructor says to fix it"
    }
  ],
  "bestMomentsForReference": [
    {
      "timestamp": "MM:SS",
      "description": "what is shown at this moment",
      "useCase": "when to show this to a student during live coaching"
    }
  ]
}`,
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
}
```

### Step 5c: Analyze all videos (parallel execution)

```typescript
async function analyzeAllVideos(
  videos: YouTubeDiscoveryResult,
  skill: string,
  goal: string
): Promise<VideoAnalysis[]> {
  // Run all video analyses in parallel for speed
  const analysisPromises = videos.videos.map(video =>
    analyzeYouTubeVideo(video.url, skill, goal)
  );

  // Push status updates as each completes
  const results: VideoAnalysis[] = [];
  for (const promise of analysisPromises) {
    try {
      const analysis = await promise;
      results.push(analysis);
      emitResearchStatus(`📺 Analyzed: "${analysis.title}"`);
    } catch (error) {
      console.error("Failed to analyze video:", error);
      // Continue with remaining videos — don't fail the whole pipeline
    }
  }

  return results;
}
```

### Important constraints

- YouTube URL feature is in preview and free — no billing for video analysis
- Only public YouTube videos can be analyzed
- One video URL per API request (that's why we parallelize)
- Videos up to 1 hour long can be processed with a 1M context window model
- Video is sampled at 1 FPS, audio at 1Kbps — ~300 tokens per second of video
- A 10-minute tutorial ≈ 180,000 tokens — well within context limits

### Frontend updates during this step

```
📺 Found: "Jacques Pépin's Knife Skills" — analyzing...
📺 Found: "Gordon Ramsay's Basic Knife Skills" — analyzing...
📺 Analyzed: "Jacques Pépin's Knife Skills" — 4 key techniques at 1:43, 3:15, 5:02, 7:30
📺 Analyzed: "Gordon Ramsay's Basic Knife Skills" — 3 techniques, 2 common mistakes shown
```

---

## STEP 6: Skill Model Synthesis

### Purpose

Take all the research (web research + video analyses + user preferences) and synthesize into a single, structured skill model. This is the document that will drive the coaching session.

### Implementation

```typescript
interface SkillModel {
  metadata: {
    skill: string;
    goal: string;
    level: string;
    createdAt: string;
    illustration: string;
  };
  teachingStrategy: {
    approach: string;
    learningStyle: string;
    successCriteria: string;
    pacingNotes: string;
  };
  properForm: Record<string, string>;
  commonMistakes: Array<{
    issue: string;
    severity: string;
    correction: string;
    videoReference?: { url: string; timestamp: string };
  }>;
  progressionOrder: string[];
  safetyConsiderations: string[];
  videoReferences: Array<{
    url: string;
    title: string;
    bestMoments: Array<{
      timestamp: string;
      description: string;
      useCase: string;
    }>;
  }>;
  sessionPlan: {
    primaryFocus: string;
    secondaryFocus: string;
    warmupActivity: string;
    keyCheckpoints: string[];
    successIndicators: string[];
  };
  webSources: Array<{ title: string; url: string }>;
}

async function synthesizeSkillModel(
  input: SkillSelectionInput,
  preferences: TeachingPreferences,
  webResearch: WebResearchResult,
  videoAnalyses: VideoAnalysis[],
  illustrationUrl: string
): Promise<SkillModel> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are synthesizing research into a coaching plan. Here is everything gathered:

## USER CONTEXT
Skill: ${input.skill}
Goal: ${input.goal}
Level: ${input.skillLevel}
Equipment: ${preferences.equipmentContext}
Learning style: ${preferences.learningStyle}
Success criteria: ${preferences.successCriteria}
Teaching approach: ${preferences.teachingApproach}

## WEB RESEARCH
${JSON.stringify(webResearch, null, 2)}

## VIDEO ANALYSES
${JSON.stringify(videoAnalyses, null, 2)}

Synthesize all of this into a unified coaching skill model. Key requirements:

1. MERGE duplicate information — if web research and videos both mention the same technique, combine them into the most complete description
2. PRIORITIZE video-sourced information for visual/form details since we can reference those timestamps during coaching
3. CROSS-REFERENCE common mistakes from web research with video demonstrations — if a video shows the mistake being corrected, link them
4. CREATE A SESSION PLAN that's specifically tailored to this user's level, goal, and learning style
5. For each common mistake, if any analyzed video shows the correct technique at a specific timestamp, include that as a videoReference

Return a JSON object with this structure:
{
  "metadata": {
    "skill": "${input.skill}",
    "goal": "${input.goal}",
    "level": "${input.skillLevel}",
    "createdAt": "${new Date().toISOString()}",
    "illustration": "${illustrationUrl}"
  },
  "teachingStrategy": {
    "approach": "tailored teaching approach based on user preferences",
    "learningStyle": "the user's preferred learning style",
    "successCriteria": "what success looks like for this user",
    "pacingNotes": "how to pace corrections and new information for this user"
  },
  "properForm": {
    "aspect_name": "precise observable description — this is what the live coaching AI will compare against the video feed"
  },
  "commonMistakes": [
    {
      "issue": "observable description of what the mistake looks like",
      "severity": "high | medium | low",
      "correction": "specific action to fix it",
      "videoReference": { "url": "youtube url", "timestamp": "MM:SS" }
    }
  ],
  "progressionOrder": ["step 1", "step 2"],
  "safetyConsiderations": ["..."],
  "videoReferences": [
    {
      "url": "youtube url",
      "title": "video title",
      "bestMoments": [
        {
          "timestamp": "MM:SS",
          "description": "what is shown",
          "useCase": "when to show this during live coaching"
        }
      ]
    }
  ],
  "sessionPlan": {
    "primaryFocus": "the main thing to work on this session",
    "secondaryFocus": "backup focus if primary is mastered quickly",
    "warmupActivity": "what to do first to ease in",
    "keyCheckpoints": ["checkpoint 1 to watch for", "checkpoint 2"],
    "successIndicators": ["observable sign that the student is getting it"]
  },
  "webSources": [{ "title": "...", "url": "..." }]
}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text);
}
```

### Frontend update

```
✅ Research synthesized — coaching plan ready
```

---

## STEP 7: Calendar Context Pull

### Purpose

Check the user's Google Calendar to understand their schedule and suggest optimal practice sessions.

### Implementation

```typescript
import { google } from "googleapis";

async function getCalendarContext(
  auth: any, // OAuth2 client
  daysAhead: number = 7
): Promise<CalendarContext> {
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  // Get busy times
  const freeBusyResponse = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busySlots = freeBusyResponse.data.calendars?.primary?.busy || [];

  // Find free slots suitable for a 15-30 min practice session
  const freeSlots = findFreeSlots(busySlots, now, future, 30); // 30 min minimum

  return {
    busySlots,
    suggestedPracticeTimes: freeSlots.slice(0, 3), // Top 3 suggestions
    timeZone: freeBusyResponse.data.timeZone || "America/Los_Angeles",
  };
}

interface CalendarContext {
  busySlots: Array<{ start: string; end: string }>;
  suggestedPracticeTimes: Array<{ start: string; end: string }>;
  timeZone: string;
}

function findFreeSlots(
  busySlots: Array<{ start?: string; end?: string }>,
  rangeStart: Date,
  rangeEnd: Date,
  minDurationMinutes: number
): Array<{ start: string; end: string }> {
  // Sort busy slots by start time
  const sorted = busySlots
    .filter(s => s.start && s.end)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

  const freeSlots: Array<{ start: string; end: string }> = [];
  let cursor = rangeStart;

  for (const busy of sorted) {
    const busyStart = new Date(busy.start!);
    const busyEnd = new Date(busy.end!);

    if (busyStart > cursor) {
      const gapMinutes = (busyStart.getTime() - cursor.getTime()) / 60000;
      if (gapMinutes >= minDurationMinutes) {
        // Only suggest slots during reasonable hours (8am - 9pm)
        const hour = cursor.getHours();
        if (hour >= 8 && hour <= 21) {
          freeSlots.push({
            start: cursor.toISOString(),
            end: new Date(cursor.getTime() + minDurationMinutes * 60000).toISOString(),
          });
        }
      }
    }

    cursor = busyEnd > cursor ? busyEnd : cursor;
  }

  return freeSlots;
}
```

---

## STEP 8: Save to Google Docs

### Purpose

Create or update a Google Doc containing the full skill model. This doc serves as the persistent memory of the coaching relationship.

### Implementation

#### Step 8a: Create the coaching document

```typescript
import { google } from "googleapis";

async function createOrUpdateSkillDocument(
  auth: any,
  skillModel: SkillModel,
  existingDocId?: string
): Promise<string> {
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  let documentId: string;

  if (existingDocId) {
    // Update existing document — append new session data
    documentId = existingDocId;
    await appendToExistingDoc(docs, documentId, skillModel);
  } else {
    // Create new document
    const createResponse = await docs.documents.create({
      requestBody: {
        title: `Coaching: ${skillModel.metadata.skill} — Skill Model`,
      },
    });
    documentId = createResponse.data.documentId!;

    // Write the full skill model to the new document
    await writeSkillModelToDoc(docs, documentId, skillModel);

    // Optionally move to a "Coaching" folder in Drive
    await moveToCoachingFolder(drive, documentId);
  }

  return documentId;
}
```

#### Step 8b: Write skill model content to the document

```typescript
async function writeSkillModelToDoc(
  docs: any,
  documentId: string,
  model: SkillModel
): Promise<void> {
  // Build the document content as a series of batchUpdate requests
  // Google Docs API requires insertText operations with specific indices
  // Content is inserted in REVERSE order (last section first) because each
  // insert pushes existing content down

  const content = buildDocumentContent(model);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: content.requests,
    },
  });
}

function buildDocumentContent(model: SkillModel): { requests: any[] } {
  const requests: any[] = [];
  let text = "";

  // Build the full document text
  text += `SKILL MODEL: ${model.metadata.skill}\n`;
  text += `Goal: ${model.metadata.goal}\n`;
  text += `Level: ${model.metadata.level}\n`;
  text += `Created: ${model.metadata.createdAt}\n`;
  text += `\n`;

  text += `═══ TEACHING STRATEGY ═══\n`;
  text += `Approach: ${model.teachingStrategy.approach}\n`;
  text += `Learning Style: ${model.teachingStrategy.learningStyle}\n`;
  text += `Success Criteria: ${model.teachingStrategy.successCriteria}\n`;
  text += `Pacing: ${model.teachingStrategy.pacingNotes}\n`;
  text += `\n`;

  text += `═══ PROPER FORM ═══\n`;
  for (const [aspect, description] of Object.entries(model.properForm)) {
    text += `• ${aspect}: ${description}\n`;
  }
  text += `\n`;

  text += `═══ COMMON MISTAKES (by severity) ═══\n`;
  const sortedMistakes = [...model.commonMistakes].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.severity as keyof typeof order] || 2) - (order[b.severity as keyof typeof order] || 2);
  });
  for (const mistake of sortedMistakes) {
    text += `[${mistake.severity.toUpperCase()}] ${mistake.issue}\n`;
    text += `  Fix: ${mistake.correction}\n`;
    if (mistake.videoReference) {
      text += `  Video: ${mistake.videoReference.url} at ${mistake.videoReference.timestamp}\n`;
    }
    text += `\n`;
  }

  text += `═══ PROGRESSION ORDER ═══\n`;
  model.progressionOrder.forEach((step, i) => {
    text += `${i + 1}. ${step}\n`;
  });
  text += `\n`;

  text += `═══ SAFETY ═══\n`;
  for (const consideration of model.safetyConsiderations) {
    text += `⚠ ${consideration}\n`;
  }
  text += `\n`;

  text += `═══ VIDEO REFERENCES ═══\n`;
  for (const video of model.videoReferences) {
    text += `📺 ${video.title}\n`;
    text += `   URL: ${video.url}\n`;
    for (const moment of video.bestMoments) {
      text += `   ${moment.timestamp} — ${moment.description} (use: ${moment.useCase})\n`;
    }
    text += `\n`;
  }

  text += `═══ SESSION PLAN ═══\n`;
  text += `Primary Focus: ${model.sessionPlan.primaryFocus}\n`;
  text += `Secondary Focus: ${model.sessionPlan.secondaryFocus}\n`;
  text += `Warmup: ${model.sessionPlan.warmupActivity}\n`;
  text += `Checkpoints:\n`;
  for (const checkpoint of model.sessionPlan.keyCheckpoints) {
    text += `  ✓ ${checkpoint}\n`;
  }
  text += `Success Indicators:\n`;
  for (const indicator of model.sessionPlan.successIndicators) {
    text += `  ★ ${indicator}\n`;
  }
  text += `\n`;

  text += `═══ SOURCES ═══\n`;
  for (const source of model.webSources) {
    text += `• ${source.title}: ${source.url}\n`;
  }

  text += `\n═══ USER MODEL ═══\n`;
  text += `(Updated after each session)\n`;
  text += `Sessions completed: 0\n`;
  text += `Mastered: none yet\n`;
  text += `Improving: none yet\n`;
  text += `Needs work: all areas\n`;

  // Insert all text at index 1 (after the implicit newline at the start of every doc)
  requests.push({
    insertText: {
      location: { index: 1 },
      text: text,
    },
  });

  return { requests };
}
```

#### Step 8c: Save the raw JSON skill model to Drive (for programmatic access)

The Google Doc is human-readable. But for the Live API system prompt, you need the raw JSON. Save it as a JSON file in Drive:

```typescript
async function saveSkillModelJSON(
  drive: any,
  model: SkillModel,
  folderId?: string
): Promise<string> {
  const fileMetadata = {
    name: `skill-model-${model.metadata.skill.replace(/\s+/g, "-")}.json`,
    mimeType: "application/json",
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const media = {
    mimeType: "application/json",
    body: JSON.stringify(model, null, 2),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
  });

  return response.data.id;
}
```

#### Helper: Create or find the coaching folder

```typescript
async function getOrCreateCoachingFolder(drive: any): Promise<string> {
  // Check if folder already exists
  const searchResponse = await drive.files.list({
    q: "name='AI Coaching' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id, name)",
  });

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    return searchResponse.data.files[0].id;
  }

  // Create the folder
  const createResponse = await drive.files.create({
    requestBody: {
      name: "AI Coaching",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  return createResponse.data.id;
}

async function moveToCoachingFolder(drive: any, fileId: string): Promise<void> {
  const folderId = await getOrCreateCoachingFolder(drive);

  // Get current parents
  const file = await drive.files.get({
    fileId,
    fields: "parents",
  });

  const previousParents = file.data.parents?.join(",") || "";

  await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, parents",
  });
}
```

---

## STEP 9: Prepare Session Context (System Prompt Assembly)

### Purpose

Assemble the system prompt that will be injected into the Gemini Live API session. This combines the skill model, user model (if returning user), session goals, and coaching rules.

### Implementation

```typescript
interface UserModel {
  totalSessions: number;
  mastered: string[];
  improving: Array<{ area: string; trend: string }>;
  needsWork: Array<{ area: string; priority: number }>;
  preferences: {
    pushesBackOn: string[];
    respondsWellTo: string[];
    coachingStyle: string;
  };
}

function assembleSystemPrompt(
  skillModel: SkillModel,
  userModel: UserModel | null, // null if first session
  calendarContext: CalendarContext | null
): string {
  let prompt = `[ROLE]
You are a real-time coaching assistant. You watch the user via their camera feed (1 frame per second) and provide live voice feedback. You are warm, specific, and encouraging. You are NOT a chatbot — you are a coach standing next to the user watching them practice.

[SKILL MODEL — WHAT GOOD LOOKS LIKE]
Skill: ${skillModel.metadata.skill}
Goal: ${skillModel.metadata.goal}
Level: ${skillModel.metadata.level}

Proper form to watch for:
${Object.entries(skillModel.properForm).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

[COMMON MISTAKES TO WATCH FOR]
${skillModel.commonMistakes.map(m => `- [${m.severity}] ${m.issue} → Fix: ${m.correction}${m.videoReference ? ` (video ref: ${m.videoReference.url} at ${m.videoReference.timestamp})` : ""}`).join("\n")}

[TEACHING STRATEGY FOR THIS USER]
Approach: ${skillModel.teachingStrategy.approach}
Learning style: ${skillModel.teachingStrategy.learningStyle}
Pacing: ${skillModel.teachingStrategy.pacingNotes}
Success criteria: ${skillModel.teachingStrategy.successCriteria}

[SESSION PLAN]
Primary focus: ${skillModel.sessionPlan.primaryFocus}
Secondary focus: ${skillModel.sessionPlan.secondaryFocus}
Warmup: ${skillModel.sessionPlan.warmupActivity}
Checkpoints to watch for:
${skillModel.sessionPlan.keyCheckpoints.map(c => `- ${c}`).join("\n")}
Success indicators:
${skillModel.sessionPlan.successIndicators.map(s => `- ${s}`).join("\n")}

[VIDEO REFERENCES — USE THESE DURING COACHING]
When you need to show the student a technique, call the reference_tutorial function with one of these:
${skillModel.videoReferences.map(v => v.bestMoments.map(m => `- "${m.description}" → url: ${v.url}, timestamp: ${m.timestamp}, use when: ${m.useCase}`).join("\n")).join("\n")}

[SAFETY]
${skillModel.safetyConsiderations.map(s => `- ${s}`).join("\n")}
`;

  // Add user model if returning user
  if (userModel && userModel.totalSessions > 0) {
    prompt += `
[USER HISTORY — SESSION ${userModel.totalSessions + 1}]
This is NOT the user's first session. They have completed ${userModel.totalSessions} previous sessions.

Already mastered (DO NOT correct these):
${userModel.mastered.length > 0 ? userModel.mastered.map(m => `- ${m}`).join("\n") : "- Nothing mastered yet"}

Currently improving (reinforce but don't over-correct):
${userModel.improving.map(i => `- ${i.area} (trend: ${i.trend})`).join("\n")}

Still needs work (prioritize corrections here):
${userModel.needsWork.map(n => `- ${n.area} (priority: ${n.priority})`).join("\n")}

User preferences:
- Pushes back on: ${userModel.preferences.pushesBackOn.join(", ") || "nothing noted"}
- Responds well to: ${userModel.preferences.respondsWellTo.join(", ") || "nothing noted"}
- Coaching style: ${userModel.preferences.coachingStyle}
`;
  }

  prompt += `
[INTERVENTION RULES — FOLLOW THESE STRICTLY]
1. Prioritize ONE correction at a time. Never dump multiple corrections.
2. Use this escalation hierarchy:
   - Tier 1 (ACKNOWLEDGE): Brief positive feedback when user does something well. "Good, that was cleaner." Use frequently.
   - Tier 2 (VERBAL CORRECT): Short voice correction for minor issues. "Try keeping the blade tip on the board."
   - Tier 3 (VISUAL CORRECT): Call generate_annotation() when the correction is spatial/positional AND you've given the same verbal correction 2-3 times without improvement. Say "Hold on, let me show you something" before calling.
   - Tier 4 (TUTORIAL): Call reference_tutorial() when the issue is a fundamental technique misunderstanding, not just a minor adjustment. Say "Let me show you how this should look."
3. NEVER skip tiers. Always start at Tier 1 or 2 for a new issue. Only escalate if the user doesn't adjust.
4. Log EVERY piece of feedback by calling log_observation().
5. If the user pushes back on a correction ("I think that was fine"), acknowledge it and note it. Don't argue.
6. If the user asks a question, answer it directly and concisely.
7. Call update_skill_status() when you observe clear improvement or mastery of a specific area.

[VOICE STYLE]
- Concise. This is real-time coaching, not a lecture.
- Specific. "Curl your fingers more" not "be careful."
- Encouraging. Acknowledge progress regularly.
- Natural. Talk like a supportive human coach, not a robot.

[FUNCTION CALLING]
You have these tools available:
- log_observation(tier, description, timestamp): Log every piece of feedback
- generate_annotation(correction, bodyPart): Generate a visual overlay on the user's video frame
- reference_tutorial(url, timestamp, reason): Show a YouTube clip to the student
- update_skill_status(area, status): Mark an area as needs_work, improving, or mastered
`;

  return prompt;
}
```

---

## Full Orchestration: Putting It All Together

```typescript
// This is the main function that orchestrates the entire research pipeline
// Called when the user clicks "Prepare Session" on the Session Prep screen

async function executeResearchPipeline(
  input: SkillSelectionInput,
  interviewAnswers: InterviewAnswer[],
  auth: any, // Google OAuth2 client
  onStatusUpdate: (status: string) => void // Push updates to frontend
): Promise<ResearchPipelineResult> {

  // ── STEP 2: Process interview answers ──
  onStatusUpdate("Understanding your learning preferences...");
  const questions = await generateInterviewQuestions(input);
  const preferences = await processInterviewAnswers(input, questions, interviewAnswers);

  // ── STEPS 3, 4, 5 run in PARALLEL ──
  onStatusUpdate("🔍 Researching your skill...");

  const [
    illustrationUrl,
    webResearch,
    youtubeDiscovery,
    calendarContext,
  ] = await Promise.all([
    // Step 3: Generate illustration
    generateSkillIllustration(input.skill).catch(err => {
      console.error("Illustration generation failed:", err);
      return "/fallback-skill-icon.png"; // Fallback
    }),

    // Step 4: Web research
    conductWebResearch(input.skill, input.goal, input.skillLevel, preferences).then(result => {
      onStatusUpdate(`✅ Proper form identified: ${Object.keys(result.properForm).join(", ")}`);
      onStatusUpdate(`⚠️ ${result.commonMistakes.length} common mistakes cataloged`);
      return result;
    }),

    // Step 5a: YouTube discovery
    input.contextSources.youtube
      ? discoverYouTubeTutorials(input.skill, input.goal, input.skillLevel).then(result => {
          result.videos.forEach(v => {
            onStatusUpdate(`📺 Found: "${v.title}"`);
          });
          return result;
        })
      : Promise.resolve({ videos: [] }),

    // Step 7: Calendar context
    input.contextSources.calendar
      ? getCalendarContext(auth).catch(err => {
          console.error("Calendar access failed:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // ── STEP 5b: Analyze YouTube videos (sequential after discovery) ──
  let videoAnalyses: VideoAnalysis[] = [];
  if (youtubeDiscovery.videos.length > 0) {
    onStatusUpdate("📺 Analyzing tutorial videos...");
    videoAnalyses = await analyzeAllVideos(youtubeDiscovery, input.skill, input.goal);
  }

  // ── STEP 6: Synthesize skill model ──
  onStatusUpdate("🧠 Synthesizing coaching plan...");
  const skillModel = await synthesizeSkillModel(
    input,
    preferences,
    webResearch,
    videoAnalyses,
    illustrationUrl
  );

  // ── STEP 8: Save to Google Docs ──
  onStatusUpdate("📄 Saving to Google Docs...");
  const drive = google.drive({ version: "v3", auth });
  const folderId = await getOrCreateCoachingFolder(drive);

  const [documentId, jsonFileId] = await Promise.all([
    input.contextSources.docs
      ? createOrUpdateSkillDocument(auth, skillModel)
      : Promise.resolve(null),
    saveSkillModelJSON(drive, skillModel, folderId),
  ]);

  // ── STEP 9: Assemble system prompt ──
  const userModel = null; // null for first session, loaded from Docs for returning users
  const systemPrompt = assembleSystemPrompt(skillModel, userModel, calendarContext);

  onStatusUpdate("✅ Ready to coach!");

  return {
    skillModel,
    systemPrompt,
    illustrationUrl,
    documentId,
    jsonFileId,
    calendarContext,
    videoReferences: skillModel.videoReferences,
  };
}

interface ResearchPipelineResult {
  skillModel: SkillModel;
  systemPrompt: string;
  illustrationUrl: string;
  documentId: string | null;
  jsonFileId: string;
  calendarContext: CalendarContext | null;
  videoReferences: SkillModel["videoReferences"];
}
```

---

## Returning User Flow

When a user returns with an existing skill, the pipeline is shorter:

```typescript
async function executeReturningUserPipeline(
  input: SkillSelectionInput,
  existingDocId: string,
  existingJsonFileId: string,
  auth: any,
  onStatusUpdate: (status: string) => void
): Promise<ResearchPipelineResult> {

  onStatusUpdate("Loading your coaching history...");

  const drive = google.drive({ version: "v3", auth });

  // Load existing skill model and user model from Drive
  const existingModelResponse = await drive.files.get({
    fileId: existingJsonFileId,
    alt: "media",
  });
  const existingModel: SkillModel = existingModelResponse.data;

  // Load user model from the coaching document
  const userModel = await extractUserModelFromDoc(auth, existingDocId);

  onStatusUpdate("Checking for new techniques and tutorials...");

  // Optionally check for new YouTube tutorials since last session
  const newVideos = await discoverYouTubeTutorials(
    input.skill,
    input.goal,
    input.skillLevel
  );

  // Filter to only truly new videos (not already in the skill model)
  const existingUrls = new Set(existingModel.videoReferences.map(v => v.url));
  const genuinelyNewVideos = newVideos.videos.filter(v => !existingUrls.has(v.url));

  if (genuinelyNewVideos.length > 0) {
    onStatusUpdate(`📺 Found ${genuinelyNewVideos.length} new tutorial(s) — analyzing...`);
    const newAnalyses = await analyzeAllVideos(
      { videos: genuinelyNewVideos },
      input.skill,
      input.goal
    );
    // Merge new video references into existing model
    for (const analysis of newAnalyses) {
      existingModel.videoReferences.push({
        url: analysis.url,
        title: analysis.title,
        bestMoments: analysis.bestMomentsForReference,
      });
    }
  }

  // Update session plan based on user's progress
  existingModel.sessionPlan = await generateUpdatedSessionPlan(
    existingModel,
    userModel,
    input.goal
  );

  // Get calendar context
  const calendarContext = input.contextSources.calendar
    ? await getCalendarContext(auth).catch(() => null)
    : null;

  // Assemble system prompt with user history
  const systemPrompt = assembleSystemPrompt(existingModel, userModel, calendarContext);

  onStatusUpdate("✅ Ready for session " + (userModel.totalSessions + 1) + "!");

  return {
    skillModel: existingModel,
    systemPrompt,
    illustrationUrl: existingModel.metadata.illustration,
    documentId: existingDocId,
    jsonFileId: existingJsonFileId,
    calendarContext,
    videoReferences: existingModel.videoReferences,
  };
}

async function generateUpdatedSessionPlan(
  model: SkillModel,
  userModel: UserModel,
  newGoal: string
): Promise<SkillModel["sessionPlan"]> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Based on a student's progress, generate an updated session plan.

Skill: ${model.metadata.skill}
Student's new goal: ${newGoal}
Sessions completed: ${userModel.totalSessions}

Mastered areas: ${userModel.mastered.join(", ") || "none"}
Improving areas: ${userModel.improving.map(i => i.area).join(", ") || "none"}
Still needs work: ${userModel.needsWork.map(n => n.area).join(", ") || "none"}

Overall progression path:
${model.progressionOrder.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Generate a session plan that:
- Skips mastered areas entirely
- Briefly reinforces improving areas
- Focuses on the highest-priority "needs work" area
- Advances to the next progression step if appropriate

Return JSON:
{
  "primaryFocus": "...",
  "secondaryFocus": "...",
  "warmupActivity": "...",
  "keyCheckpoints": ["..."],
  "successIndicators": ["..."]
}`,
    config: { responseMimeType: "application/json" },
  });

  return JSON.parse(response.text);
}
```

---

## Error Handling & Edge Cases

```typescript
// Wrap the entire pipeline in error handling
async function safeExecuteResearchPipeline(
  input: SkillSelectionInput,
  interviewAnswers: InterviewAnswer[],
  auth: any,
  onStatusUpdate: (status: string) => void
): Promise<ResearchPipelineResult> {
  try {
    return await executeResearchPipeline(input, interviewAnswers, auth, onStatusUpdate);
  } catch (error) {
    console.error("Research pipeline failed:", error);

    // Determine what failed and provide degraded experience
    if (error.message?.includes("youtube") || error.message?.includes("video")) {
      onStatusUpdate("⚠️ Couldn't analyze videos — proceeding with web research only");
      // Retry without YouTube
      input.contextSources.youtube = false;
      return await executeResearchPipeline(input, interviewAnswers, auth, onStatusUpdate);
    }

    if (error.message?.includes("docs") || error.message?.includes("calendar")) {
      onStatusUpdate("⚠️ Workspace connection issue — coaching will work without saving");
      // Proceed without Workspace integration
      input.contextSources.docs = false;
      input.contextSources.calendar = false;
      return await executeResearchPipeline(input, interviewAnswers, auth, onStatusUpdate);
    }

    // If Gemini itself is failing, we can't proceed
    throw new Error("Research pipeline failed: " + error.message);
  }
}
```

---

## Timing Expectations

| Step | Expected Duration | Notes |
|---|---|---|
| Interview questions generation | ~1-2 sec | Simple text generation |
| Interview answer processing | ~1-2 sec | Simple text generation |
| Skill illustration (Nano Banana) | ~3-8 sec | Runs in parallel |
| Web research (search grounding) | ~3-5 sec | Runs in parallel |
| YouTube discovery | ~2-4 sec | Runs in parallel |
| YouTube video analysis (per video) | ~5-15 sec | Depends on video length, runs in parallel per video |
| Skill model synthesis | ~3-5 sec | Largest prompt, needs to process all research |
| Calendar context pull | ~1-2 sec | Simple API call, runs in parallel |
| Save to Google Docs | ~2-3 sec | API write operations |
| System prompt assembly | <1 sec | Local string construction |
| **Total (new skill)** | **~15-25 sec** | Most steps parallelized |
| **Total (returning user)** | **~5-10 sec** | Skips most research |

---

## File Structure

```
src/
├── lib/
│   ├── research/
│   │   ├── pipeline.ts           # Main orchestrator (executeResearchPipeline)
│   │   ├── interview.ts          # Steps 2a, 2b — preference interview
│   │   ├── illustration.ts       # Step 3 — Nano Banana skill illustration
│   │   ├── web-research.ts       # Step 4 — Google Search grounding research
│   │   ├── youtube-discovery.ts  # Step 5a — find relevant tutorials
│   │   ├── youtube-analysis.ts   # Step 5b — deep video analysis
│   │   ├── synthesis.ts          # Step 6 — merge all research into skill model
│   │   ├── calendar.ts           # Step 7 — calendar context
│   │   ├── docs-storage.ts       # Step 8 — Google Docs read/write
│   │   ├── prompt-assembly.ts    # Step 9 — system prompt construction
│   │   └── types.ts              # All TypeScript interfaces
│   ├── auth/
│   │   └── google-oauth.ts       # OAuth2 setup and token management
│   └── gemini/
│       └── client.ts             # Gemini API client initialization
├── app/
│   ├── api/
│   │   └── research/
│   │       └── route.ts          # API route that triggers the pipeline
│   └── session-prep/
│       └── page.tsx              # Session Prep UI with interview + research loading
```
