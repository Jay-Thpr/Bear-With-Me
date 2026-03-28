"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video as VideoIcon, VideoOff, Pause, Play, MessageSquare, X, CheckCircle, Info, PlaySquare, TriangleAlert, Target } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import clsx from "clsx";

type Tier = 1 | 2 | 3 | 4;

interface LogEntry {
  id: string;
  timeText: string;
  tier: Tier;
  message: string;
}

const INITIAL_LOGS: LogEntry[] = [
  { id: "log-1", timeText: "2:15", tier: 1, message: "Good, that slice was much more even" },
  { id: "log-2", timeText: "3:42", tier: 2, message: "Try to keep the blade tip on the board — lift from the heel, not the tip" },
];

function LiveCoachingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") || "the skill";

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(10 * 60);

  const [currentTier, setCurrentTier] = useState<Tier>(2);
  const [currentMessage, setCurrentMessage] = useState("Try to keep the blade tip on the board — lift from the heel, not the tip");
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  
  const [showVisualAid, setShowVisualAid] = useState<"none" | "annotated" | "video">("none");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        if (!camOn) {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          if (videoRef.current) videoRef.current.srcObject = null;
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" }, 
          audio: false 
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    
    setupCamera();

    return () => {
      // We don't want to stop the stream on every re-render unless component unmounts
      // The dependency array handles camOn changes, so this cleanup is mainly for unmount.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [camOn]);
  // Format time
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const msecs = secs % 60;
    return `${mins}:${msecs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setTimeRemaining(t => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Demo behavior: trigger a Tier 3 annotation after 5 seconds
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setCurrentTier(3);
      setCurrentMessage("Hold on, let me show you something. Wait for the visual...");
      setShowVisualAid("annotated");
      setLogs(prev => [...prev, { id: "log-3", timeText: formatTime(10 * 60 - timeRemaining), tier: 3, message: "Let me show you the wrist position" }]);
    }, 5000);

    return () => clearTimeout(timer1);
  }, []);

  const handleEnd = () => {
    if (confirm("End session? Your progress will be saved.")) {
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
            {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
            <span className={clsx("relative inline-flex rounded-full h-3 w-3", isPaused ? "bg-zinc-600" : "bg-red-500")}></span>
          </div>
          <span className="font-semibold text-lg text-zinc-200">
            Session: <span className="capitalize">{skill}</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
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
          
          {/* Waveform indicator when AI speaks */}
          <div className="absolute top-6 right-6 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-2 border border-white/10 shadow-2xl">
            <span className="text-xs font-semibold text-zinc-300 tracking-wider">COACH ACTIVE</span>
            <div className="flex gap-1 items-end h-4">
               {[1,2,3,4,5].map(i => (
                 <motion.div 
                   key={i} 
                   className="w-1 bg-emerald-500 rounded-full"
                   animate={{ height: ["20%", "100%", "40%", "80%", "20%"] }}
                   transition={{ duration: 0.8 + (i * 0.1), repeat: Infinity, repeatType: "mirror" }}
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
                {/* Section A - Current Instruction */}
                <div className={clsx("p-5 rounded-2xl border flex items-start gap-4 shadow-xl shrink-0 transition-colors duration-500", getTierStyles(currentTier))}>
                  {getTierIcon(currentTier)}
                  <div className="flex-1">
                    <p className="text-sm font-medium leading-relaxed">{currentMessage}</p>
                    {currentTier === 3 && <div className="mt-2 text-xs font-bold uppercase tracking-wider opacity-80 animate-pulse">See visual below ↓</div>}
                    {currentTier === 4 && <div className="mt-2 text-xs font-bold uppercase tracking-wider opacity-80 animate-pulse">Watch this technique ↓</div>}
                  </div>
                </div>

                {/* Section B - Visual Aid Area */}
                <div className="min-h-[250px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative flex flex-col shrink-0 shadow-2xl">
                  <div className="absolute top-3 left-4 text-xs font-semibold text-zinc-500 uppercase tracking-widest z-10 bg-black/50 px-2 py-1 rounded backdrop-blur-md">Visual Aid</div>
                  
                  {showVisualAid === "annotated" && (
                     <div className="flex-1 flex flex-col p-2 pt-12">
                       <div className="flex-1 flex gap-2">
                         <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden group">
                           <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=400&auto=format&fit=crop')] bg-cover" />
                           <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-white rounded">You</div>
                         </div>
                         <div className="flex-1 bg-zinc-800 rounded-xl relative overflow-hidden ring-2 ring-emerald-500/50">
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=400&auto=format&fit=crop')] bg-cover" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-24 h-24 border-4 border-amber-500 rounded-full animate-pulse" />
                              <svg className="absolute w-12 h-12 text-amber-500 translate-x-8 -translate-y-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                            </div>
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-[10px] text-emerald-400 rounded">Correction</div>
                         </div>
                       </div>
                       <div className="mt-3 flex gap-3 text-sm px-2">
                         <button onClick={() => setShowVisualAid("none")} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-lg font-medium transition-colors">Got it</button>
                       </div>
                     </div>
                  )}
                </div>

                {/* Section C - Session Log */}
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
                     <div className="h-4" /> {/* spacing */}
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

export default function LiveCoaching() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <LiveCoachingContent />
    </Suspense>
  )
}
