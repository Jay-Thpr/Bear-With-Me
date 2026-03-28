"use client";

import { motion } from "framer-motion";
import { PenTool, CheckCircle2, PlaySquare, Calendar, Sparkles, Wand2, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function SessionPrepContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") || "Unknown Skill";

  const [isReturningUser, setIsReturningUser] = useState(false);
  const [goal, setGoal] = useState("");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [preferences, setPreferences] = useState("Visual feedback, calm tone, short corrections");
  const [constraints, setConstraints] = useState("10 minute practice block");
  const [environment, setEnvironment] = useState("Kitchen counter with overhead lighting");
  const [equipment, setEquipment] = useState("Chef's knife, cutting board");

  useEffect(() => {
    // In real app, we'd fetch the user's progress model from the backend.
    const returning = localStorage.getItem("isReturningUser") === "true";
    setIsReturningUser(returning);
    
    if (returning) {
      setGoal("Improve dice cut speed while maintaining uniform size");
    } else {
      setGoal("Learn the fundamentals and basic rocking cut");
    }
  }, []);

  const handleStart = () => {
    const isReturning = localStorage.getItem("isReturningUser") === "true";
    sessionStorage.setItem("sessionNumber", isReturning ? "7" : "1");
    sessionStorage.setItem("researchIntake", JSON.stringify({
      skill,
      goal,
      level,
      preferences,
      constraints,
      environment,
      equipment: equipment
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    }));
    sessionStorage.removeItem("researchClarificationAnswers");
    const params = new URLSearchParams({ skill });
    router.push(`/research-loading?${params.toString()}`);
  };

  return (
    <div className="flex-1 flex flex-col pt-24 px-6 md:px-12 max-w-4xl mx-auto w-full pb-24">
      <Link href="/skill-selection" className="text-zinc-500 hover:text-white transition-colors text-sm mb-8 inline-flex items-center gap-1">
        &larr; Change skill
      </Link>
      
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-zinc-800 flex items-center justify-center relative overflow-hidden shrink-0 border border-zinc-700 shadow-xl">
             <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[url('https://images.unsplash.com/photo-1595759747514-6c3ece83d1ba?q=80&w=200&auto=format&fit=crop')] bg-cover" />
             <PenTool className="w-10 h-10 text-emerald-400 relative z-10 drop-shadow-md" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400">
              <Sparkles className="w-3 h-3" />
              {isReturningUser ? "Coach Memory Loaded" : "New Skill Profiling"}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2">
              Preparing <span className="capitalize">{skill}</span>
            </h1>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
        
        {/* Main Context Area */}
        <div className="md:col-span-3 space-y-6">
          
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] group-hover:bg-emerald-500/20 transition-colors duration-700" />
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  <Wand2 className="w-4 h-4" /> Recommended Focus
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
                  <p className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
                    "{goal}"
                  </p>
                  {isReturningUser ? (
                    <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">
                      Based on your Session 6 post-report. You've mastered the pinch grip, so we're advancing to speed drills today.
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">
                      As a new learner, your coach will start with the foundational mechanics and safety protocols.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Research Intake</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-zinc-600 mb-2">Current Level</div>
                  <div className="flex gap-2">
                    {(["beginner", "intermediate", "advanced"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLevel(option)}
                        className={`rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                          level === option
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-600 mb-2">Preferences</div>
                  <textarea
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-600 mb-2">Constraints</div>
                  <textarea
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-600 mb-2">Practice Environment</div>
                  <input
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-600 mb-2">Equipment</div>
                  <input
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    placeholder="Comma-separated"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
              </div>
            </div>
          </motion.div>

        </div>

        {/* Action Sidebar */}
        <div className="md:col-span-2 space-y-6">
          
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
             <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Connected Systems</h2>
             <div className="space-y-4">
               <div className="flex items-center gap-3">
                 <div className="bg-emerald-500/10 p-2 rounded-lg">
                   <PlaySquare className="w-5 h-5 text-emerald-400" />
                 </div>
                 <div>
                   <div className="text-sm font-medium text-white">YouTube Research</div>
                   <div className="text-xs text-zinc-500">Active • Coaching model synced</div>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 <div className="bg-emerald-500/10 p-2 rounded-lg">
                   <Calendar className="w-5 h-5 text-emerald-400" />
                 </div>
                 <div>
                   <div className="text-sm font-medium text-white">Google Calendar</div>
                   <div className="text-xs text-zinc-500">Active • Ready to schedule</div>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 <div className="bg-emerald-500/10 p-2 rounded-lg">
                   <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                 </div>
                 <div>
                   <div className="text-sm font-medium text-white">Camera & Mic</div>
                   <div className="text-xs text-zinc-500">Permissions granted</div>
                 </div>
               </div>
             </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <button 
              onClick={handleStart}
              className="w-full bg-white text-zinc-950 py-5 px-6 rounded-2xl font-bold flex items-center justify-between group hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              <span className="text-lg">Build Coaching Plan</span>
              <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center group-hover:bg-zinc-300 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </div>
            </button>
            <p className="text-center text-xs text-zinc-500 mt-4 px-4 leading-relaxed">
              Coach will compile tutorials and generate the coaching plan before starting.
            </p>
          </motion.div>

        </div>
      </div>
    </div>
  );
}

export default function SessionPrep() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <SessionPrepContent />
    </Suspense>
  );
}
