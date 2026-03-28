"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { GeminiLiveClient, type FunctionCall } from "@/lib/live/geminiLiveClient";
import { MicPcmStreamer } from "@/lib/live/micPcmStreamer";
import { PcmPlaybackScheduler } from "@/lib/live/pcmPlayback";
import { base64ToFloat32Pcm16Le } from "@/lib/live/pcmUtils";

type Tier = 1 | 2 | 3 | 4;
const TIPS = [
  "Frame your hands and tool in the shot so the coach can see angles.",
  "If audio clips, move closer to the mic or reduce background noise.",
  "Use live corrections when you want a still annotated with form cues.",
];

interface LogEntry {
  id: string;
  timeText: string;
  tier: Tier;
  message: string;
}

const COACH_FUNCTION_DECLARATIONS = [
  {
    name: "capture_and_sync_photo",
    description: "Capture a screenshot of the current camera frame and save it to the user's Google Photos with a coaching label. Call this when the user asks for help, requests a save, or when a key moment should be recorded.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short description of what is being captured, e.g. 'Grip correction needed'" },
      },
      required: ["label"],
    },
  },
  {
    name: "log_observation",
    description: "Log every piece of coaching feedback with its tier level",
    parameters: {
      type: "object",
      properties: {
        tier: { type: "number", description: "1=acknowledge, 2=verbal correct, 3=visual correct, 4=tutorial" },
        description: { type: "string", description: "What was observed or said" },
        timestamp: { type: "string", description: "ISO timestamp" },
      },
      required: ["tier", "description"],
    },
  },
  {
    name: "generate_annotation",
    description: "Capture the user's current camera frame and generate an instructional overlay showing how to correctly perform the skill. Use when the user asks for guidance, asks how to do something, or when a visual aid would help.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "show_tutorial",
    description: "Show a video tutorial reference for a specific technique",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why this tutorial is relevant now" },
        url: { type: "string", description: "YouTube URL" },
      },
      required: ["reason"],
    },
  },
];

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySkill = searchParams.get("skill");
  const [skill, setSkill] = useState("the skill");

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(10 * 60);

  const [currentTier, setCurrentTier] = useState<Tier>(1);
  const [currentMessage, setCurrentMessage] = useState("Session starting...");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [showVisualAid, setShowVisualAid] = useState<"none" | "annotated" | "video">("none");
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);
  const [visualAidType, setVisualAidType] = useState<"correction" | "instruction">("correction");

  const [coachPhase, setCoachPhase] = useState<"off" | "connecting" | "live" | "error">("off");
  const [coachError, setCoachError] = useState<string | null>(null);

  const [photoSync, setPhotoSync] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [photoSyncMsg, setPhotoSyncMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const micStreamerRef = useRef<MicPcmStreamer | null>(null);
  const playbackRef = useRef<PcmPlaybackScheduler | null>(null);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const goodFormCaptureCount = useRef(0);
  const skillRef = useRef("the skill");
  const sessionId = useRef(
    new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  );

  useEffect(() => {
    if (querySkill?.trim()) {
      setSkill(querySkill);
      skillRef.current = querySkill;
      return;
    }

    try {
      const intakeRaw = sessionStorage.getItem("researchIntake");
      if (!intakeRaw) return;
      const intake = JSON.parse(intakeRaw) as { skill?: string };
      if (intake.skill?.trim()) {
        setSkill(intake.skill);
        skillRef.current = intake.skill;
      }
    } catch {
      // fall back to default label
    }
  }, [querySkill]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const msecs = secs % 60;
    return `${mins}:${msecs.toString().padStart(2, "0")}`;
  };

  // ── Camera setup ──
  useEffect(() => {
    async function setupCamera() {
      try {
        if (!camOn) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (videoRef.current) videoRef.current.srcObject = null;
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("[session] Camera error:", err);
      }
    }
    setupCamera();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [camOn]);

  // ── Timer ──
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => setTimeRemaining((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // ── Capture current frame as base64 ──
  const captureFrameBase64 = useCallback((quality = 0.9): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const c = canvasRef.current;
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")?.drawImage(video, 0, 0);
    return c.toDataURL("image/jpeg", quality).split(",")[1];
  }, []);

  // ── Sync photo to Google Photos silently (no UI spinner for auto-captures) ──
  const syncPhotoSilent = useCallback(async (label: string, skillName: string) => {
    const b64 = captureFrameBase64(0.85);
    if (!b64) return;
    try {
      await fetch("/api/photos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: b64, skill: skillName, label, sessionId: sessionId.current }),
      });
    } catch {
      // Silent — never block coaching flow
    }
  }, [captureFrameBase64]);

  // ── Stop media helpers ──
  const stopMedia = useCallback(async () => {
    if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
    await micStreamerRef.current?.stop(); micStreamerRef.current = null;
    await playbackRef.current?.close(); playbackRef.current = null;
  }, []);

  // ── Handle function calls from Gemini ──
  const handleToolCall = useCallback(async (calls: FunctionCall[]) => {
    for (const call of calls) {
      switch (call.name) {
        case "log_observation": {
          const tier = Number(call.args.tier ?? 2) as Tier;
          const description = String(call.args.description ?? "");
          const entry: LogEntry = {
            id: `log-${Date.now()}`,
            timeText: formatTime(10 * 60 - timeRemaining),
            tier,
            message: description,
          };
          setLogs((prev) => [...prev, entry]);
          setCurrentTier(tier);
          setCurrentMessage(description);
          fetch("/api/session/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier, description, timestamp: new Date().toISOString() }),
          }).catch(() => {});
          // ── Auto-capture based on coaching tier ──
          if (tier === 2) {
            void syncPhotoSilent(`Mistake: ${description}`, skillRef.current);
          } else if (tier === 3) {
            void syncPhotoSilent(`Visual correction: ${description}`, skillRef.current);
          } else if (tier === 4) {
            void syncPhotoSilent(`Tutorial moment: ${description}`, skillRef.current);
          } else if (tier === 1) {
            goodFormCaptureCount.current += 1;
            if (goodFormCaptureCount.current % 4 === 0) {
              void syncPhotoSilent(`Good form: ${description}`, skillRef.current);
            }
          }
          break;
        }
        case "generate_annotation": {
          const b64 = captureFrameBase64(0.85);
          if (!b64) break;
          try {
            const res = await fetch("/api/annotate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ frameBase64: b64, skill: skillRef.current }),
            });
            const { imageUrl } = await res.json();
            if (imageUrl) {
              setAnnotatedFrameUrl(imageUrl);
              setShowVisualAid("annotated");
              setVisualAidType("instruction");
              const annotatedBase64 = imageUrl.split(",")[1];
              if (annotatedBase64) {
                void fetch("/api/photos/upload", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ frameBase64: annotatedBase64, skill: skillRef.current, label: "Annotation", sessionId: sessionId.current }),
                }).catch(() => {});
              }
            }
          } catch (err) {
            console.error("[session] Annotation failed:", err);
          }
          break;
        }
        case "show_tutorial":
          setShowVisualAid("video");
          setCurrentMessage(`Watch this technique: ${String(call.args.reason ?? "")}`);
          setCurrentTier(4);
          break;
        case "capture_and_sync_photo": {
          const snapBase64 = captureFrameBase64(0.9);
          const snapLabel = String(call.args.label ?? "Coaching screenshot");
          if (!snapBase64) break;
          setPhotoSync("syncing");
          setPhotoSyncMsg(null);
          try {
            const res = await fetch("/api/photos/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ frameBase64: snapBase64, skill: skillRef.current, label: snapLabel, sessionId: sessionId.current }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              setPhotoSync("done");
              setPhotoSyncMsg("Saved to Google Photos");
            } else {
              setPhotoSync("error");
              setPhotoSyncMsg(data.error || "Photo sync failed");
            }
          } catch (err: unknown) {
            setPhotoSync("error");
            setPhotoSyncMsg(err instanceof Error ? err.message : "Photo sync failed");
          }
          setTimeout(() => setPhotoSync("idle"), 5000);
          break;
        }
      }
    }
    clientRef.current?.sendToolResponse(calls);
  }, [timeRemaining]);

  // ── Connect to Gemini Live via ephemeral token ──
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setCoachPhase("connecting");
      setCoachError(null);

      let accessToken: string, liveModel: string;
      try {
        const res = await fetch("/api/live/ephemeral-token", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Token request failed (${res.status})`);
        accessToken = data.accessToken;
        liveModel = data.liveModel;
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Token fetch failed";
        console.error("[session] Token fetch failed:", msg);
        setCoachError(msg);
        setCoachPhase("error");
        return;
      }

      if (cancelled) return;

      const systemPrompt =
        sessionStorage.getItem("systemPrompt") ||
        `You are a real-time coaching assistant watching the user practice ${skillRef.current} via their camera. Give specific, concise spoken feedback.

Function calling rules:
- Call log_observation for EVERY piece of feedback (tier 1=good form, 2=verbal correction, 3=visual correction, 4=tutorial).
- Call generate_annotation when the user says things like "show me what I'm doing wrong", "annotate my form", "highlight my mistake", or when a visual correction on their current frame would help.
- Call generate_instruction when the user says things like "show me how", "what should I do", "demonstrate the technique", "how do I do this", or when positive instructional guidance on their current frame would help.
- Call capture_and_sync_photo when the user asks to save/capture/screenshot a moment.
- Be encouraging and specific.`;

      const playback = new PcmPlaybackScheduler(24_000);
      playbackRef.current = playback;

      const client = new GeminiLiveClient();
      clientRef.current = client;

      client.connect(accessToken, liveModel, systemPrompt, COACH_FUNCTION_DECLARATIONS, {
        onSetupComplete: () => {
          if (cancelled) { client.close(); return; }
          setCoachPhase("live");
          setCurrentMessage("Coach connected — start practicing!");

          void (async () => {
            try {
              const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              if (cancelled) return;
              const mic = new MicPcmStreamer({
                onChunkBase64: (b64) => clientRef.current?.sendAudioPcmBase64(b64),
              });
              micStreamerRef.current = mic;
              await mic.start(micStream);
            } catch (e: unknown) {
              console.error("[session] Mic failed:", e instanceof Error ? e.message : e);
            }
          })();

          const canvas = document.createElement("canvas");
          canvasRef.current = canvas;
          videoTimerRef.current = setInterval(() => {
            const video = videoRef.current;
            if (!clientRef.current?.isReady || !video?.videoWidth || isPaused || !camOn) return;
            canvas.width = 640; canvas.height = 480;
            canvas.getContext("2d")?.drawImage(video, 0, 0, 640, 480);
            canvas.toBlob(
              (blob) => {
                if (!blob) return;
                const reader = new FileReader();
                reader.onloadend = () => {
                  const dataUrl = reader.result as string;
                  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
                  clientRef.current?.sendVideoJpegBase64(b64);
                };
                reader.readAsDataURL(blob);
              },
              "image/jpeg",
              0.65,
            );
          }, 1000);
        },

        onAudioBase64: (b64) => {
          const f32 = base64ToFloat32Pcm16Le(b64);
          void playbackRef.current?.resume().then(() => playbackRef.current?.playFloat32(f32));
        },

        onInterrupted: () => playbackRef.current?.interrupt(),
        onToolCall: handleToolCall,
        onInputTranscript: (text, finished) => {
          if (finished) {
            void syncPhotoSilent("User spoke", skillRef.current);

            // Keyword-triggered annotation — fires directly without waiting for Gemini
            const lower = text.toLowerCase();
            const wantsAnnotation = /show me how|what should i|how do i|demonstrate|correct form|proper form|how to do|guide me|show me what|annotate|fix my form|what am i doing wrong/.test(lower);

            if (wantsAnnotation) {
              const b64 = captureFrameBase64(0.85);
              if (b64) {
                void fetch("/api/annotate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ frameBase64: b64, skill: skillRef.current }),
                }).then((r) => r.json()).then(({ imageUrl }) => {
                  if (imageUrl) {
                    setAnnotatedFrameUrl(imageUrl);
                    setShowVisualAid("annotated");
                    setVisualAidType("instruction");
                  }
                }).catch(() => {});
              }
            }
          }
        },
        onOutputTranscript: (text, finished) => {
          if (text.trim()) setCurrentMessage(text);
          if (finished) {
            void syncPhotoSilent("Coach spoke", skillRef.current);
          }
        },

        onError: (msg) => {
          console.error("[session] Gemini error:", msg);
          setCoachError(msg);
          setCoachPhase("error");
          void stopMedia();
        },

        onClose: (info) => {
          clientRef.current = null;
          void stopMedia();
          if (!cancelled) {
            setCoachPhase(info.code === 1000 && info.wasClean ? "off" : "error");
            if (!(info.code === 1000 && info.wasClean)) {
              setCoachError(info.reason?.trim() || `Session closed (code ${info.code})`);
            }
          }
        },
      });
    }

    connect();

    return () => {
      cancelled = true;
      void stopMedia();
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isPaused && videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  }, [isPaused]);

  const handleEnd = () => {
    if (confirm("End session? Your progress will be saved.")) {
      void stopMedia();
      clientRef.current?.close();
      clientRef.current = null;
      router.push(`/post-session-report?skill=${encodeURIComponent(skill)}`);
    }
  };

  const phaseCurrent = coachPhase === "live" ? 4 : coachPhase === "connecting" ? 3 : coachPhase === "error" ? 2 : 1;
  const sessionMeta =
    coachPhase === "live"
      ? "Coach connected — stay in frame and keep practicing."
      : coachPhase === "connecting"
        ? "Opening realtime session…"
        : coachPhase === "error"
          ? "Coach connection hit an error; check the network and try again."
          : "Camera and mic stay local until the live session is connected.";

  return (
    <div className="page page--session">
      <p className="page__lead">
        Start your camera, connect to Gemini Live, and practice with spoken feedback.
        The coach can request annotated stills while the session log tracks each intervention.
      </p>

      <div className="session-shell">
        <header className="session-header">
          <div>
            <h2 className="page__title page__title--sm" style={{ margin: 0 }}>
              Live coaching
            </h2>
            <p className="session-header__meta">{sessionMeta}</p>
          </div>
          <div className="session-header__right">
            <div className="session-timer" aria-live="polite">
              {formatTime(10 * 60 - timeRemaining)}
            </div>
            <button type="button" className="btn btn--ghost" onClick={handleEnd}>
              End session
            </button>
          </div>
        </header>

        <div className={`session-main-grid${showVisualAid !== "none" ? " session-main-grid--split" : ""}`}>
          <div className="session-video-card">
            {coachPhase === "live" && (
              <div className="session-rec-badge">
                <span className="session-rec-badge__dot" aria-hidden />
                <span>Live</span>
              </div>
            )}
            {photoSync === "syncing" && (
              <div className="session-rec-badge" style={{ right: "3rem", background: "rgba(59,130,246,0.85)" }}>
                <span>📸 Saving…</span>
              </div>
            )}
            {photoSync === "done" && (
              <div className="session-rec-badge" style={{ right: "3rem", background: "rgba(34,197,94,0.85)" }}>
                <span>✓ {photoSyncMsg ?? "Saved to Google Photos"}</span>
              </div>
            )}
            {photoSync === "error" && (
              <div className="session-rec-badge" style={{ right: "3rem", background: "rgba(239,68,68,0.85)" }}>
                <span>⚠ {photoSyncMsg ?? "Sync failed"}</span>
              </div>
            )}
            <div className={`session-placeholder__frame ${camOn ? "session-placeholder__frame--live" : ""}`}>
              {camOn ? (
                <video ref={videoRef} autoPlay playsInline muted className="session-camera" />
              ) : (
                <div className="session-camera__overlay">
                  <span className="session-placeholder__label">Camera off</span>
                </div>
              )}
              <div className="session-coach-strip">
                <p className="session-coach-strip__title">Coach</p>
                <p className="session-coach-strip__text">
                  {currentMessage || "Listening — keep practicing and narrate what you are trying."}
                </p>
              </div>
            </div>
          </div>

          {showVisualAid !== "none" ? (
            <section className="session-correction-card" aria-label="Annotated still">
              <div className="session-correction-card__head">
                <span>
                  {showVisualAid === "video"
                    ? "📹 Tutorial cue"
                    : "🎯 Ideal form — compare to yourself"}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setShowVisualAid("none");
                    setAnnotatedFrameUrl(null);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="session-correction-card__body">
                {showVisualAid === "annotated" && annotatedFrameUrl ? (
                  <img
                    src={annotatedFrameUrl}
                    alt={visualAidType === "instruction" ? "Instructional technique guide" : "Form correction annotation"}
                    className="session-correction-card__img"
                  />
                ) : (
                  <p className="session-correction-card__notes">
                    {showVisualAid === "video"
                      ? "Gemini suggested a tutorial reference."
                      : "Generating annotation…"}
                  </p>
                )}
                <p className="session-correction-card__notes">
                  Compare your live camera to this reference and adjust your form to match.
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <div className="session-columns">
          <div className="session-side-panel">
            <h3 className="session-side-panel__title">Session progress</h3>
            <ol className="session-phase-list">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
                const done = step < phaseCurrent;
                const current = step === phaseCurrent;
                return (
                  <li
                    key={step}
                    className={`session-phase${done ? " session-phase--done" : ""}${current ? " session-phase--current" : ""}`}
                  >
                    <span className="session-phase__idx">{done ? "✓" : step}</span>
                    <span>Checkpoint {step}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="session-side-panel">
            <h3 className="session-side-panel__title">Current focus</h3>
            <p style={{ margin: 0, fontWeight: 600, color: "#5a8068" }}>Live status</p>
            <p style={{ margin: "0.35rem 0 0.85rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {coachPhase === "error" && coachError ? coachError : currentMessage}
            </p>
            <ul className="session-focus-list">
              <li>Keep the skill target visible in frame.</li>
              <li>Pause if you need to reset posture or tools.</li>
              <li>Wait for the coach strip to update before reacting to a correction.</li>
            </ul>
          </div>

          <div className="session-side-panel session-side-panel--blue">
            <h3 className="session-side-panel__title">Controls &amp; tips</h3>
            <p className="panel__meta" aria-live="polite">
              Coach:
              {" "}
              {coachPhase === "off" && "disconnected"}
              {coachPhase === "connecting" && "connecting…"}
              {coachPhase === "live" && "connected"}
              {coachPhase === "error" && "error"}
            </p>
            {coachError ? <p className="session-camera__error">{coachError}</p> : null}
            {TIPS.map((tip) => (
              <p key={tip} className="session-tip">
                <span>{tip}</span>
              </p>
            ))}
            <div className="session-camera__actions" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn btn--ghost" onClick={() => setCamOn((v) => !v)}>
                {camOn ? "Stop camera" : "Start camera"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setMicOn((v) => !v)}>
                {micOn ? "Mute mic" : "Unmute mic"}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setIsPaused((v) => !v)}>
                {isPaused ? "Resume stream" : "Pause stream"}
              </button>
            </div>
          </div>
        </div>

        <div className="session-side-panel">
          <h3 className="session-side-panel__title">Session log</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {logs.length === 0 ? (
              <p className="panel__meta">No coaching events logged yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={{ display: "flex", gap: "0.75rem", fontSize: "0.9rem" }}>
                  <span style={{ minWidth: "3rem", fontFamily: "ui-monospace, monospace", color: "var(--text-muted)" }}>
                    {log.timeText}
                  </span>
                  <span style={{ color: "var(--text-soft)" }}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="page"><p className="panel__body">Loading…</p></div>}>
      <SessionContent />
    </Suspense>
  );
}
