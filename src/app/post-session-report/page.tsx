"use client";

import { motion } from "framer-motion";
import { Copy, Calendar, RotateCcw, PenTool, CheckCircle, TrendingUp, AlertTriangle, ArrowRight, LayoutDashboard, Share } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PostSessionReportContent() {
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") || "the skill";

  return (
    <div className="flex-1 flex flex-col pt-24 px-6 md:px-12 max-w-5xl mx-auto w-full pb-32">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-zinc-800 flex items-center justify-center relative overflow-hidden shrink-0 border border-zinc-700 shadow-2xl mb-6">
          <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[url('https://images.unsplash.com/photo-1595759747514-6c3ece83d1ba?q=80&w=300&auto=format&fit=crop')] bg-cover" />
          <PenTool className="w-12 h-12 text-emerald-400 relative z-10 drop-shadow-md" />
        </div>
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 mb-4">
          <CheckCircle className="w-3 h-3" /> User Model Synced to Google Docs
        </div>
        
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2">
          Session 7 Complete
        </h1>
        <p className="text-zinc-400 text-lg">
          <span className="capitalize">{skill}</span> • Mar 27, 2026 • 9:42
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Section 1 - Summary */}
        <motion.section initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="col-span-1 md:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px]" />
             
             <div className="flex-1">
               <h2 className="text-zinc-400 text-sm font-semibold uppercase tracking-widest mb-2">What we worked on</h2>
               <p className="text-2xl font-bold text-white mb-4">Rocking cut technique</p>
               <ul className="space-y-2">
                 <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /><span className="text-zinc-300">Blade angle consistency</span></li>
                 <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /><span className="text-zinc-300">Guide hand position locked in</span></li>
               </ul>
             </div>
             
             <div className="sm:w-64 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col justify-center text-center">
               <div className="text-4xl font-black text-emerald-400 mb-1">+2</div>
               <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Skills Mastered</div>
             </div>
          </div>
        </motion.section>

        {/* Section 2 - What improved */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-emerald-100 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" /> What improved
            </h2>
            
            <div className="flex-1 space-y-4">
               <div>
                 <h3 className="text-white font-medium mb-1">Wrist Pivot</h3>
                 <p className="text-sm text-emerald-200/60 mb-3">You stopped using your whole arm and correctly isolated the wrist movement.</p>
                 
                 {/* Visual Proof */}
                 <div className="bg-zinc-950 rounded-xl p-2 border border-emerald-500/20 flex gap-2 w-full mt-4">
                   <div className="flex-1 relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                     <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=400&auto=format&fit=crop')] bg-cover opacity-50 grayscale" />
                     <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-[8px] text-white rounded">Before (8:02)</div>
                   </div>
                   <div className="flex-1 relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-emerald-500/30">
                     <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=400&auto=format&fit=crop')] bg-cover" />
                     <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-[8px] text-emerald-400 rounded">After Coaching (8:45)</div>
                   </div>
                 </div>
                 <p className="text-xs text-emerald-500/60 mt-2 italic text-center">You corrected this during the session</p>
               </div>
            </div>
          </div>
        </motion.section>

        {/* Section 3 - Needs Work */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-amber-100 mb-6 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Focus for next time
            </h2>
            
            <ul className="space-y-4 flex-1">
              <li className="bg-zinc-950/50 border border-amber-500/10 rounded-xl p-4">
                <div className="flex gap-3">
                  <span className="text-amber-500 font-bold mt-0.5">1</span>
                  <div>
                    <h3 className="text-white font-medium mb-1">Speed under pressure</h3>
                    <p className="text-sm text-amber-200/60">Form breaks down when cutting faster. We'll focus on smooth acceleration next time.</p>
                  </div>
                </div>
              </li>
              <li className="bg-zinc-950/50 border border-amber-500/10 rounded-xl p-4">
                <div className="flex gap-3">
                  <span className="text-zinc-500 font-bold mt-0.5">2</span>
                  <div>
                    <h3 className="text-white font-medium mb-1">Uniform slice size</h3>
                    <p className="text-sm text-zinc-400 leading-snug">The guide hand is sliding slightly unevenly. Keep the claw tight.</p>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </motion.section>

        {/* Section 5 - Next Session & Actions */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="col-span-1 md:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="flex-1 max-w-lg">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-2">Up Next</h2>
              <p className="text-xl font-bold text-white mb-2">Practice speed while maintaining size</p>
              <p className="text-zinc-400 mb-6">Based on your progression, your coach recommends practicing again in 2 days to lock in muscle memory.</p>
              
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-start gap-4 mb-2">
                <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400 shrink-0 mt-0.5">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white mb-1">Calendar Sync Proposed</div>
                  <div className="text-xs text-zinc-400 mb-3 leading-relaxed">Adding "Knife Skills: Session 8" to your Google Calendar for this Thursday to reinforce muscle memory.</div>
                  <button className="bg-white text-zinc-950 px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-200 transition-colors">
                    Confirm & Schedule
                  </button>
                </div>
              </div>
            </div>
            
            <div className="w-full md:w-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 shrink-0">
              <Link href="/session-briefing?skill=Knife skills">
                <button className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 px-6 py-4 rounded-xl font-medium hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-lg"><RotateCcw className="w-4 h-4 text-emerald-400" /></div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">Start Another</div>
                    <div className="text-xs text-zinc-500">Same skill, new focus</div>
                  </div>
                </button>
              </Link>
              
              <Link href="/">
                <button className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 px-6 py-4 rounded-xl font-medium hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-lg"><LayoutDashboard className="w-4 h-4 text-blue-400" /></div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">All Sessions</div>
                    <div className="text-xs text-zinc-500">View progression</div>
                  </div>
                </button>
              </Link>
            </div>

          </div>
        </motion.section>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex justify-center mt-6">
        <button className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-2 transition-colors">
          <Share className="w-4 h-4" /> Share visual progress card
        </button>
      </motion.div>

    </div>
  );
}

export default function PostSessionReport() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <PostSessionReportContent />
    </Suspense>
  )
}
