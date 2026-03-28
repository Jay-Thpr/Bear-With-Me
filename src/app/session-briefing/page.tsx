"use client";

import { motion } from "framer-motion";
import { PenTool, Target, TrendingUp, PlaySquare, Settings2, Sparkles, RefreshCw, ChevronRight, CheckCircle2, Calendar } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import clsx from "clsx";

function SessionBriefingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") || "the skill";
  
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [goal, setGoal] = useState("");
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  useEffect(() => {
    // Read skill model from sessionStorage written by research-loading
    try {
      const skillModelJson = sessionStorage.getItem("skillModelJson");
      if (skillModelJson) {
        const skillModel = JSON.parse(skillModelJson);
        const derivedGoal =
          skillModel.sessionPlan?.primaryFocus ||
          skillModel.metadata?.goal ||
          null;
        if (derivedGoal) setGoal(derivedGoal);
      }
    } catch {
      // Fall through to defaults
    }

    // Fall through defaults if goal still empty
    setGoal(prev => {
      if (prev) return prev;
      const isMockReturning = skill.toLowerCase().includes("knife");
      return isMockReturning
        ? "Increase dice cut speed while maintaining uniform size and wrist pivot"
        : "Learn the foundational mechanics and establish safe muscle memory";
    });

    const isReturning = localStorage.getItem("isReturningUser") === "true";
    setIsReturningUser(isReturning);
  }, [skill]);

  const handleStartLive = () => {
    router.push(`/live-coaching?skill=${encodeURIComponent(skill)}`);
  };

  return (
    <div className="flex-1 flex flex-col pt-24 px-6 md:px-12 max-w-6xl mx-auto w-full pb-32">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <Link href="/skill-selection" className="text-zinc-500 hover:text-white transition-colors text-sm mb-6 inline-block">
          &larr; Back to select
        </Link>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center relative overflow-hidden shrink-0 border border-zinc-700 shadow-xl">
             <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[url('https://images.unsplash.com/photo-1595759747514-6c3ece83d1ba?q=80&w=200&auto=format&fit=crop')] bg-cover" />
             <PenTool className="w-10 h-10 text-emerald-400 relative z-10 drop-shadow-md" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400">
              <Sparkles className="w-3 h-3" />
              {isReturningUser ? "User Model Synced" : "Skill Model Ready"}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2">
              Locker Room — <span className="capitalize">{skill}</span>
            </h1>
            <p className="text-zinc-400 text-lg">Your coach is ready for session {isReturningUser ? "7" : "1"}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Smart Goal Area */}
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-4 h-4" /> Next Logical Step
                </h2>
                <button 
                  onClick={() => setIsEditingGoal(!isEditingGoal)}
                  className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> {isEditingGoal ? "Cancel" : "Override"}
                </button>
              </div>

              {isEditingGoal ? (
                <div className="relative z-10 mt-4">
                  <textarea
                    autoFocus
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="w-full bg-zinc-950/50 border border-emerald-500/50 rounded-xl p-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                    rows={3}
                  />
                </div>
              ) : (
                <div className="relative z-10 mt-2">
                  <p className="text-2xl font-bold text-white leading-tight mb-4">{goal}</p>
                  {isReturningUser ? (
                    <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">
                       Based on your progression. We noticed you mastered the pinch grip last time, so we won't correct that unless form degrades.
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">
                       Based on standard learning models. We'll start slow and assess your comfort level today.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.section>

          {/* Past Sessions (Returning Context) */}
          {isReturningUser && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Context Timeline
              </h2>
              
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
                {[5, 6].map((num) => (
                  <div key={num} className="snap-start shrink-0 w-72 bg-zinc-950 border border-zinc-800 rounded-2xl p-5 relative">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-500">Session {num}</div>
                        <div className="text-xs text-zinc-600">Mar {20 + num}, 2026</div>
                      </div>
                      <div className="text-xs font-semibold px-2 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/20">
                        Recorded
                      </div>
                    </div>
                    <p className="text-zinc-300 text-sm mb-4">Focused on grip, improved blade angle.</p>
                    <div className="h-24 w-full bg-zinc-800 rounded-xl overflow-hidden relative border border-zinc-700">
                      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1595759747514-6c3ece83d1ba?q=80&w=300&auto=format&fit=crop')] bg-cover opacity-50 grayscale hover:grayscale-0 transition-all" />
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 font-mono text-[10px] text-zinc-400">
                        [Annotated Frame]
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          
          {/* Profile Details */}
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Profile Insights</h2>
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs text-zinc-600 mb-1">Current Level</div>
                  <div className="text-white font-medium">{isReturningUser ? "Intermediate" : "Assessing..."}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-600 mb-1">Style</div>
                  <div className="text-white font-medium">Visual-heavy</div>
                </div>
                <div className="col-span-2 pt-2 border-t border-zinc-800">
                  <div className="text-xs text-zinc-600 mb-3">Active Integrations</div>
                  <div className="flex gap-2">
                    <div className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center gap-2 text-xs font-medium text-emerald-400"><PlaySquare className="w-4 h-4" /> YouTube</div>
                    <div className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center gap-2 text-xs font-medium text-blue-400"><Calendar className="w-4 h-4" /> Calendar</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
          
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-6 relative">
               <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-3">System Check</h2>
               <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3 text-sm text-emerald-400 font-medium">
                   <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center shrink-0"><CheckCircle2 className="w-3 h-3" /></div>
                   Mic & Camera Ready
                 </div>
                 <div className="flex items-center gap-3 text-sm text-emerald-400 font-medium">
                   <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center shrink-0"><CheckCircle2 className="w-3 h-3" /></div>
                   Skill Model Injected
                 </div>
               </div>
            </div>
          </motion.section>

        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.5 }}
        className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent z-50 flex flex-col items-center"
      >
        <button 
          onClick={handleStartLive}
          className="w-full max-w-sm bg-white text-zinc-950 py-5 px-8 rounded-2xl font-bold flex items-center justify-center gap-3 group hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)]"
        >
          <span className="text-lg">Step Into the Session</span>
          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
        <p className="text-xs text-zinc-500 mt-4">
          Session will last up to 10 minutes. Your coach is observing.
        </p>
      </motion.div>

    </div>
  );
}

export default function SessionBriefing() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <SessionBriefingContent />
    </Suspense>
  )
}
