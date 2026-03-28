"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Pause, Play,
  MessageSquare, X, CheckCircle, Info, PlaySquare, TriangleAlert,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import clsx from "clsx";
import { GeminiLiveClient, type FunctionCall } from "@/lib/live/geminiLiveClient";
import { MicPcmStreamer } from "@/lib/live/micPcmStreamer";
import { PcmPlaybackScheduler } from "@/lib/live/pcmPlayback";
import { base64ToFloat32Pcm16Le } from "@/lib/live/pcmUtils";

type Tier = 1 | 2 | 3 | 4;

interface LogEntry {
  id: string;
  timeText: string;
  tier: Tier;
  message: string;
}

const COACH_FUNCTION_DECLARATIONS = [
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
    description: "Request a visual annotation on the user's current video frame. Call this for Tier 3 corrections.",
    parameters: {
      type: "object",
      properties: {
        correction: { type: "string", description: "What needs to be corrected" },
        bodyPart: { type: "string", description: "The body part or tool to annotate" },
      },
      required: ["correction"],
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
  const skill = searchParams.get("skill") || "the skill";

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(10 * 60);

  const [currentTier, setCurrentTier] = useState<Tier>(1);
  const [currentMessage, setCurrentMessage] = useState("Session starting...");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [showVisualAid, setShowVisualAid] = useState<"none" | "annotated" | "video">("none");
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);

  const [coachPhase, setCoachPhase] = useState<"off" | "connecting" | "live" | "error">("off");
  const [coachError, setCoachError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<GeminiLiveClient | null>(null);
  const micStreamerRef = useRef<MicPcmStreamer | null>(null);
  const playbackRef = useRef<PcmPlaybackScheduler | null>(null);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
          break;
        }
        case "generate_annotation": {
          const video = videoRef.current;
          if (!video || video.videoWidth === 0) break;
          if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d")?.drawImage(video, 0, 0);
          const frameBase64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
          try {
            const res = await fetch("/api/annotate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ frameBase64, correction: call.args.correction, bodyPart: call.args.bodyPart }),
            });
            const { imageUrl } = await res.json();
            if (imageUrl) { setAnnotatedFrameUrl(imageUrl); setShowVisualAid("annotated"); }
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
        `You are a real-time coaching assistant watching the user practice ${skill} via their camera. Give specific, concise spoken feedback. Call log_observation for every correction. Call generate_annotation when showing a visual correction. Be encouraging and specific.`;

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
        onOutputTranscript: (text) => { if (text.trim()) setCurrentMessage(text); },

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

  const getTierStyles = (tier: Tier) => {
    switch (tier) {
      case 1: return "bg-emerald-500/10 border-emerald-500/30 text-emerald-100";
      case 2: return "bg-zinc-800 border-zinc-700 text-zinc-200";
      case 3: return "bg-amber-500/10 border-amber-500/30 text-amber-100";
      case 4: return "bg-purple-500/10 border-purple-500/30 text-purple-100";
    }
  };

  const getTierIcon = (tier: Tier) => {
    switch (tier) {
      case 1: return <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 2: return <Info className="w-5 h-5 text-zinc-400 shrink-0" />;
      case 3: return <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0" />;
      case 4: return <PlaySquare className="w-5 h-5 text-purple-500 shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden p-4 gap-4">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-3 w-3 relative">
            {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />}
            <span className={clsx("relative inline-flex rounded-full h-3 w-3", isPaused ? "bg-zinc-600" : "bg-red-500")} />
          </div>
          <span className="font-semibold text-lg text-zinc-200">
            Session: <span className="capitalize">{skill}</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className={clsx("w-2 h-2 rounded-full", {
              "bg-zinc-600": coachPhase === "off",
              "bg-amber-400 animate-pulse": coachPhase === "connecting",
              "bg-emerald-500 animate-pulse": coachPhase === "live",
              "bg-red-500": coachPhase === "error",
            })} />
            {coachPhase === "connecting" && "Connecting..."}
            {coachPhase === "live" && "Coach active"}
            {coachPhase === "error" && (coachError ? `Error: ${coachError.slice(0, 40)}` : "Connection error")}
          </div>
          <div className={clsx("font-mono text-xl", timeRemaining <= 60 ? "text-amber-500 animate-pulse" : "text-zinc-300")}>
            ⏱ {formatTime(timeRemaining)}
          </div>
          <button onClick={handleEnd} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            End
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-[1] flex min-h-0 relative w-full overflow-hidden">
        {/* Left: Video Feed */}
        <motion.div
          layout
          initial={false}
          animate={{ width: showVisualAid === "none" ? "100%" : "60%" }}
          transition={{ type: "spring", bounce: 0, duration: 0.7 }}
          className="relative h-full rounded-2xl overflow-hidden shrink-0 bg-zinc-900 border border-zinc-800 z-10"
        >
          <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center">
            {camOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={clsx("w-full h-full object-cover transition-all duration-700", isPaused && "blur-md scale-105")}
              />
            ) : (
              <div className="text-zinc-600 flex flex-col items-center">
                <VideoOff className="w-16 h-16 mb-4 opacity-50" />
                <p>Camera is off</p>
              </div>
            )}
          </div>
          <div className="absolute top-6 right-6 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-2 border border-white/10 shadow-2xl">
            <span className="text-xs font-semibold text-zinc-300 tracking-wider">COACH ACTIVE</span>
            <div className="flex gap-1 items-end h-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-emerald-500 rounded-full"
                  animate={{ height: ["20%", "100%", "40%", "80%", "20%"] }}
                  transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, repeatType: "mirror" }}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right: Coach Panel */}
        <AnimatePresence>
          {showVisualAid !== "none" && (
            <motion.div
              layout
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "40%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.7 }}
              className="relative h-full shrink-0 flex flex-col gap-4 pl-4 overflow-hidden z-0"
            >
              <div className="w-full flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
                <div className={clsx("p-5 rounded-2xl border flex items-start gap-4 shadow-xl shrink-0 transition-colors duration-500", getTierStyles(currentTier))}>
                  {getTierIcon(currentTier)}
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-relaxed">{currentMessage}</p>
                    {currentTier === 3 && <div className="mt-2 text-xs font-bold uppercase tracking-wider opacity-80 animate-pulse">See visual below ↓</div>}
                    {currentTier === 4 && <div className="mt-2 text-xs font-bold uppercase tracking-wider opacity-80 animate-pulse">Watch this technique ↓</div>}
                  </div>
                </div>

                <div className="min-h-[250px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative flex flex-col shrink-0 shadow-2xl">
                  <div className="absolute top-3 left-4 text-xs font-semibold text-zinc-500 uppercase tracking-widest z-10 bg-black/50 px-2 py-1 rounded backdrop-blur-md">Visual Aid</div>
                  {showVisualAid === "annotated" && (
                    <div className="flex-1 flex flex-col p-2 pt-12">
                      <div className="flex-1 flex gap-2">
                        <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden">
                          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-white rounded">You</div>
                        </div>
                        <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden ring-2 ring-emerald-500/50">
                          {annotatedFrameUrl ? (
                            <img src={annotatedFrameUrl} alt="Coaching annotation" className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-xs text-zinc-500 text-center px-2">Generating annotation...</div>
                            </div>
                          )}
                          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-amber-400 rounded">Correction</div>
                        </div>
                      </div>
                      <button
                        onClick={() => { setShowVisualAid("none"); setAnnotatedFrameUrl(null); }}
                        className="mt-3 text-xs text-zinc-500 hover:text-white text-center w-full transition-colors"
                      >
                        Got it — dismiss
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-[1] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden min-h-[150px] shadow-2xl">
                  <div className="px-4 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-widest bg-zinc-950/50">
                    Session Log
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {logs.map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <div className="text-zinc-500 font-mono text-xs w-10 shrink-0">{log.timeText}</div>
                        <div className="mt-1 shrink-0">
                          {log.tier === 1 && <span className="flex w-2 h-2 rounded-full bg-emerald-500" />}
                          {log.tier === 2 && <span className="flex w-2 h-2 rounded-full bg-zinc-400" />}
                          {log.tier === 3 && <span className="flex w-2 h-2 rounded-full bg-amber-500" />}
                          {log.tier === 4 && <span className="flex w-2 h-2 rounded-full bg-purple-500" />}
                        </div>
                        <div className="text-zinc-300 leading-snug">{log.message}</div>
                      </div>
                    ))}
                    <div className="h-4" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Control Bar */}
      <footer className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shrink-0">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setMicOn(!micOn)}
            className={clsx("p-4 rounded-xl flex items-center justify-center transition-colors", micOn ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-red-500/20 text-red-500 hover:bg-red-500/30")}
          >
            {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
          <button
            onClick={() => setCamOn(!camOn)}
            className={clsx("p-4 rounded-xl flex items-center justify-center transition-colors", camOn ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-red-500/20 text-red-500 hover:bg-red-500/30")}
          >
            {camOn ? <VideoIcon className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
          <div className="w-px h-10 bg-zinc-800 mx-2" />
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-4 rounded-xl flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          >
            {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
          </button>
          <button
            className="px-6 py-4 rounded-xl flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
            onClick={() => alert("Provides a prompt window to ask the coach a specific question.")}
          >
            <MessageSquare className="w-5 h-5" />
            Ask Coach
          </button>
          <div className="w-px h-10 bg-zinc-800 mx-2" />
          <button onClick={handleEnd} className="p-4 rounded-xl flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black text-white">Loading…</div>}>
      <SessionContent />
    </Suspense>
  );
}
