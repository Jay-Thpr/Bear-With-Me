"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, ChevronLeft, PenTool, Trophy, Music, Palette } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";

const PRESET_SKILLS = [
  {
    id: "knife-skills",
    name: "Knife Skills",
    description: "Master the grip, dice, and rock cut",
    icon: PenTool,
    color: "emerald",
    bgPattern: "https://images.unsplash.com/photo-1595759747514-6c3ece83d1ba?q=80&w=400&auto=format&fit=crop",
    sessions: 3,
    level: "Intermediate",
  },
  {
    id: "free-throw",
    name: "Free Throw",
    description: "Perfect your form, arc, and follow-through",
    icon: Trophy,
    color: "orange",
    bgPattern: "https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=400&auto=format&fit=crop",
    sessions: 0,
    level: "Beginner",
  },
  {
    id: "guitar-chords",
    name: "Guitar Chords",
    description: "Learn finger placement and smooth transitions",
    icon: Music,
    color: "amber",
    bgPattern: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?q=80&w=400&auto=format&fit=crop",
    sessions: 0,
    level: "Beginner",
  },
  {
    id: "watercolor",
    name: "Watercolor",
    description: "Brush control, washes, and smooth blending",
    icon: Palette,
    color: "blue",
    bgPattern: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=400&auto=format&fit=crop",
    sessions: 1,
    level: "Beginner",
  },
];

const colorMap: Record<string, string> = {
  emerald: "text-emerald-400 bg-emerald-500 shadow-emerald-500/50 border-emerald-500/50",
  orange: "text-orange-400 bg-orange-500 shadow-orange-500/50 border-orange-500/50",
  amber: "text-amber-400 bg-amber-500 shadow-amber-500/50 border-amber-500/50",
  blue: "text-blue-400 bg-blue-500 shadow-blue-500/50 border-blue-500/50",
};

export default function SkillSelection() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [customSkill, setCustomSkill] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSelectSkill = (skillName: string, sessions: number = 0) => {
    if (sessions > 0) {
      router.push(`/session-briefing?skill=${encodeURIComponent(skillName)}`);
    } else {
      router.push(`/research-loading?skill=${encodeURIComponent(skillName)}`);
    }
  };

  const handleNext = () => setActiveIndex((prev) => (prev + 1) % PRESET_SKILLS.length);
  const handlePrev = () => setActiveIndex((prev) => (prev - 1 + PRESET_SKILLS.length) % PRESET_SKILLS.length);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customSkill.trim()) {
      handleSelectSkill(customSkill.trim(), 0);
    }
  };

  return (
    <div className="flex-1 flex flex-col pt-12 md:pt-20 px-6 max-w-7xl mx-auto w-full min-h-screen overflow-hidden">
      
      {/* Search & Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center z-50 relative">
        <Link href="/" className="text-zinc-500 hover:text-white transition-colors text-sm mb-6 inline-block self-start md:self-auto md:absolute md:left-0 md:top-4">
          &larr; Start over
        </Link>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-8 text-center">
          Choose Your Training
        </h1>
        
        <form onSubmit={handleSubmit} className="relative group w-full max-w-xl">
          <div className={`absolute inset-0 bg-emerald-500/20 rounded-full blur-xl transition-opacity duration-500 ${isFocused ? 'opacity-100' : 'opacity-0'}`} />
          <div className="relative flex items-center bg-zinc-900 border border-zinc-700/50 rounded-full overflow-hidden focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all shadow-xl">
            <Search className="w-5 h-5 text-zinc-400 ml-6" />
            <input
              type="text"
              className="w-full bg-transparent border-none outline-none py-4 px-4 text-zinc-200 placeholder-zinc-500"
              placeholder="Or search for a new skill..."
              value={customSkill}
              onChange={(e) => setCustomSkill(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {customSkill && (
              <button type="submit" className="mr-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 p-2 rounded-full transition-colors flex items-center justify-center">
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
      </motion.div>

      {/* Video Game Carousel */}
      <div className="flex-1 relative flex items-center justify-center mt-12 mb-20 perspective-[1000px]">
        
        {/* Navigation Buttons */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 z-50 pointer-events-none">
          <button onClick={handlePrev} className="pointer-events-auto w-14 h-14 rounded-full bg-zinc-800/80 border border-zinc-700 backdrop-blur-md flex items-center justify-center text-white hover:bg-zinc-700 hover:scale-110 active:scale-95 transition-all shadow-2xl">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={handleNext} className="pointer-events-auto w-14 h-14 rounded-full bg-zinc-800/80 border border-zinc-700 backdrop-blur-md flex items-center justify-center text-white hover:bg-zinc-700 hover:scale-110 active:scale-95 transition-all shadow-2xl">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Characters (Skills) */}
        <div className="relative w-full max-w-sm h-[500px] flex items-center justify-center transform-style-3d">
          <AnimatePresence initial={false}>
            {PRESET_SKILLS.map((skill, index) => {
              // Calculate distance from active index
              let offset = index - activeIndex;
              if (offset < -2) offset += PRESET_SKILLS.length;
              if (offset > 2) offset -= PRESET_SKILLS.length;

              const isCenter = offset === 0;
              const isLeft = offset === -1;
              const isRight = offset === 1;
              const isVisible = Math.abs(offset) <= 1;

              if (!isVisible) return null;

              const xOffset = offset * 240; 
              const scale = isCenter ? 1 : 0.75;
              const zIndex = isCenter ? 40 : 30;
              const rotateY = offset * -25; // Tilt towards center
              const opacity = isCenter ? 1 : 0.4;
              const { icon: Icon } = skill;

              return (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, x: isLeft ? -300 : isRight ? 300 : 0, scale: 0.5 }}
                  animate={{ 
                    x: xOffset, 
                    scale, 
                    zIndex, 
                    rotateY,
                    opacity 
                  }}
                  exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute w-72 md:w-80 h-[480px] origin-center cursor-pointer pointer-events-auto"
                  onClick={() => {
                    if (isCenter) handleSelectSkill(skill.name, skill.sessions);
                    else if (isLeft) handlePrev();
                    else if (isRight) handleNext();
                  }}
                  whileHover={isCenter ? { scale: 1.02, y: -10 } : { opacity: 0.6 }}
                >
                  <div className={clsx(
                    "w-full h-full rounded-3xl overflow-hidden flex flex-col relative transition-all duration-300",
                    isCenter ? "border-2 bg-zinc-900 shadow-[0_0_50px_rgba(0,0,0,0.8)]" : "border-0 bg-zinc-950 grayscale"
                  )}
                  style={{
                    borderColor: isCenter && colorMap[skill.color] ? 'rgba(255,255,255,0.2)' : 'transparent'
                  }}
                  >
                    {/* Character/Icon Header */}
                    <div className="h-[55%] relative flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-cover bg-center transition-transform duration-700" style={{ backgroundImage: `url('${skill.bgPattern}')` }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent z-0" />
                      
                      {/* Character Glow & Icon */}
                      {isCenter && <div className={clsx("absolute w-40 h-40 blur-[60px] rounded-full", skill.color === 'emerald' ? 'bg-emerald-500/30' : skill.color === 'orange' ? 'bg-orange-500/30' : skill.color === 'amber' ? 'bg-amber-500/30' : 'bg-blue-500/30')} />}
                      <Icon className={clsx("w-20 h-20 relative z-10 drop-shadow-2xl transition-transform duration-500", isCenter ? "scale-110" : "scale-100", skill.color === 'emerald' ? 'text-emerald-400' : skill.color === 'orange' ? 'text-orange-400' : skill.color === 'amber' ? 'text-amber-400' : 'text-blue-400')} />
                    </div>

                    {/* Character Bio / Info */}
                    <div className="flex-1 p-6 flex flex-col justify-between z-10 bg-zinc-900 relative">
                       <div>
                         <div className="flex justify-between items-start mb-2">
                           <h2 className={clsx("text-2xl font-bold transition-colors", isCenter ? "text-white" : "text-zinc-400")}>{skill.name}</h2>
                         </div>
                         <p className="text-zinc-400 text-sm leading-relaxed line-clamp-3">{skill.description}</p>
                       </div>

                       {/* Stats */}
                       <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                         <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                           {skill.level}
                         </div>
                         {skill.sessions > 0 ? (
                           <div className="flex flex-col items-end">
                             <div className="text-xs text-zinc-500 uppercase tracking-widest">Sessions</div>
                             <div className={clsx("text-lg font-bold", skill.color === 'emerald' ? 'text-emerald-400' : skill.color === 'orange' ? 'text-orange-400' : skill.color === 'amber' ? 'text-amber-400' : 'text-blue-400')}>{skill.sessions}</div>
                           </div>
                         ) : (
                           <div className="text-xs font-medium px-2 py-1 rounded bg-zinc-800 text-zinc-400">New</div>
                         )}
                       </div>
                    </div>
                    
                    {/* Select Overlay (Only visible when active and hovering) */}
                    {isCenter && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity z-50 flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-white text-zinc-950 px-6 py-3 rounded-full font-bold text-lg shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                          Start Training
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    
      {/* Selection indicators */}
      <div className="flex justify-center gap-3 mb-10">
        {PRESET_SKILLS.map((_, i) => (
          <button 
            key={i} 
            onClick={() => setActiveIndex(i)}
            className={clsx("h-1.5 rounded-full transition-all duration-300", i === activeIndex ? "w-8 bg-white" : "w-2 bg-zinc-700 hover:bg-zinc-600")}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

    </div>
  );
}
