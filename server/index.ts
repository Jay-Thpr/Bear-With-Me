import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, type LiveConnectParameters } from "@google/genai";
import { config } from "dotenv";

config({ path: ".env.local" });

const PORT = parseInt(process.env.WS_PORT ?? "3001", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[ws] Listening on port ${PORT}`);
});

wss.on("connection", (browserWs: WebSocket) => {
  console.log("[ws] Browser connected");
  let liveSession: any = null;
  let sessionReady = false;

  // Helper: send structured message to browser
  const send = (msg: object) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify(msg));
    }
  };

  // Handle messages from browser
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
        await startGeminiSession(
          msg.skillModelJson,
          msg.userModelJson,
          send,
          (session: any) => {
            liveSession = session;
            sessionReady = true;
            send({ type: "session_ready" });
          }
        );
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

  browserWs.on("error", (err: Error) => {
    console.error("[ws] Error:", err.message);
  });
});

// Open a Gemini Live session
async function startGeminiSession(
  skillModelJson: string,
  userModelJson: string | undefined,
  send: (msg: object) => void,
  onReady: (session: any) => void
) {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    let systemInstruction: string;

    // Try to import the real assembleSystemPrompt from Track A
    try {
      const { assembleSystemPrompt } = await import("../lib/session-context");
      const skillModel = JSON.parse(skillModelJson);
      const userModel = userModelJson ? JSON.parse(userModelJson) : null;
      systemInstruction = assembleSystemPrompt(skillModel, userModel);
    } catch {
      // Fallback stub — used when Track A's session-context isn't ready yet,
      // or when skillModelJson can't be parsed
      console.warn("[ws] Using stub system prompt (lib/session-context not available or parse failed)");
      systemInstruction = `You are a real-time coaching assistant. Watch the user via camera (1 FPS). Give specific, concise verbal corrections. Be encouraging. Call log_observation for every piece of feedback. Call generate_annotation when you've corrected the same thing verbally 3 times.`;
    }

    const sessionConfig: LiveConnectParameters = {
      model: process.env.GEMINI_LIVE_MODEL ?? "gemini-2.0-flash-live-001",
      config: {
        systemInstruction,
        responseModalities: [Modality.AUDIO],
        tools: [
          {
            functionDeclarations: [
              {
                name: "log_observation",
                description: "Log every piece of coaching feedback with its tier level",
                parameters: {
                  type: "object",
                  properties: {
                    tier: {
                      type: "number",
                      description: "1=acknowledge, 2=verbal correct, 3=visual correct, 4=tutorial",
                    },
                    description: {
                      type: "string",
                      description: "What was observed or said",
                    },
                    timestamp: {
                      type: "string",
                      description: "Session timestamp MM:SS",
                    },
                  },
                  required: ["tier", "description", "timestamp"],
                },
              },
              {
                name: "generate_annotation",
                description:
                  "Generate a visual correction overlay on the user's current video frame. Use when a spatial/positional correction has been given verbally 2-3 times without improvement.",
                parameters: {
                  type: "object",
                  properties: {
                    correction: {
                      type: "string",
                      description: "What needs to be corrected",
                    },
                    bodyPart: {
                      type: "string",
                      description: "Which body part or tool to highlight",
                    },
                  },
                  required: ["correction", "bodyPart"],
                },
              },
              {
                name: "reference_tutorial",
                description:
                  "Show the student a specific YouTube tutorial clip. Use for fundamental technique misunderstandings.",
                parameters: {
                  type: "object",
                  properties: {
                    url: {
                      type: "string",
                      description: "YouTube URL",
                    },
                    timestamp: {
                      type: "string",
                      description: "Timestamp in the video MM:SS",
                    },
                    reason: {
                      type: "string",
                      description: "Why you are showing this clip",
                    },
                  },
                  required: ["url", "timestamp", "reason"],
                },
              },
              {
                name: "update_skill_status",
                description:
                  "Update the status of a skill area based on observed improvement or mastery",
                parameters: {
                  type: "object",
                  properties: {
                    area: {
                      type: "string",
                      description: "The skill area (e.g., 'pinch grip', 'blade angle')",
                    },
                    status: {
                      type: "string",
                      enum: ["needs_work", "improving", "mastered"],
                    },
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

    // Listen for Gemini Live responses
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

// Forward video frame to Gemini Live
async function forwardVideoFrame(session: any, frameBase64: string, mimeType: string) {
  try {
    await session.sendRealtimeInput({
      video: { data: frameBase64, mimeType },
    });
  } catch (err) {
    console.error("[ws] Frame forward error:", err);
  }
}

// Forward audio to Gemini Live
async function forwardAudio(session: any, audioBase64: string) {
  try {
    await session.sendRealtimeInput({
      audio: { data: audioBase64 },
    });
  } catch (err) {
    console.error("[ws] Audio forward error:", err);
  }
}

// Handle function calls from Gemini Live
async function handleFunctionCalls(
  functionCalls: any[],
  send: (msg: object) => void,
  session: any
) {
  const responses: any[] = [];

  for (const call of functionCalls) {
    const result: any = { ok: true };

    switch (call.name) {
      case "log_observation": {
        const { tier, description, timestamp } = call.args;
        console.log(`[coaching] Tier ${tier}: ${description}`);

        // Notify browser for UI log
        send({ type: "log_entry", tier: Number(tier), message: description, timestamp });

        // POST to Next.js session log endpoint (non-critical)
        try {
          await fetch("http://localhost:3000/api/session/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier, description, timestamp }),
          });
        } catch {
          // non-critical — server may not be ready
        }
        break;
      }

      case "generate_annotation": {
        const { correction, bodyPart } = call.args;
        console.log(`[coaching] Annotation requested: ${correction} on ${bodyPart}`);

        // Send annotation request to browser — browser captures frame and POSTs to /api/annotate
        send({ type: "annotation_request", correction, bodyPart });
        break;
      }

      case "reference_tutorial": {
        const { url, timestamp, reason } = call.args;
        console.log(`[coaching] Tutorial ref: ${url} at ${timestamp}`);
        send({ type: "tutorial_ref", url, timestamp, reason });
        break;
      }

      case "update_skill_status": {
        const { area, status } = call.args;
        console.log(`[coaching] Skill status: ${area} → ${status}`);
        send({ type: "skill_status_update", area, status });

        // POST to Next.js session status endpoint (non-critical)
        try {
          await fetch("http://localhost:3000/api/session/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ area, status }),
          });
        } catch {
          // non-critical
        }
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
