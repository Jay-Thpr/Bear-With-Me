"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartScreen() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [skill, setSkill] = useState("Juggling");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [timeConstraint, setTimeConstraint] = useState("10 minutes per day");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const result = await signIn("google", { callbackUrl: "/" });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = "/api/auth/signin/google?callbackUrl=%2F";
    } catch {
      window.location.href = "/api/auth/signin/google?callbackUrl=%2F";
    }
  };

  if (status !== "authenticated" || !session) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl rounded-[32px] border border-zinc-800 bg-zinc-950 p-10 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Google Workspace required
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Sign in first, then start the research flow.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">
            The app writes live research notes into Google Docs and stores the outputs in Drive. Sign in with Google
            to begin.
          </p>
          <button
            onClick={handleGoogleSignIn}
            className="mt-8 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            {isSigningIn ? "Redirecting to Google..." : "Sign in with Google"}
          </button>
        </div>
      </div>
    );
  }

  const handleStart = () => {
    const intake = {
      skill,
      goal: `Learn ${skill}`,
      level,
      constraints: timeConstraint,
    };

    sessionStorage.setItem("researchIntake", JSON.stringify(intake));
    router.push(`/research-loading?skill=${encodeURIComponent(skill)}`);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl rounded-[32px] border border-zinc-800 bg-zinc-950 p-10 shadow-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Research-first coaching
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Start with three inputs.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
          Tell the system what you want to learn, your current level, and how much time you have to work with. It
          will start research immediately and log the run into Google Docs.
        </p>

        <div className="mt-8 space-y-5 rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-6">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-zinc-500">What do you want to learn?</div>
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-zinc-500">What is your skill level?</div>
            <div className="flex flex-wrap gap-2">
              {(["beginner", "intermediate", "advanced"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setLevel(option)}
                  className={`rounded-full border px-4 py-3 text-sm capitalize ${
                    level === option
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-zinc-500">What is your time constraint to learn?</div>
            <input
              value={timeConstraint}
              onChange={(e) => setTimeConstraint(e.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        <button
          onClick={handleStart}
          className="mt-8 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
        >
          Start research
        </button>
      </div>
    </div>
  );
}
