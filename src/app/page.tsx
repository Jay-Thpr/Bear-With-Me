"use client";

import { useState } from "react";

// Research pipeline step labels — shown in status panel during the three API steps
const STEP_LABELS: Record<number, string> = {
  1: "Finding tutorials...",
  2: "Analyzing videos...",
  3: "Writing skill document...",
};

type ResearchStatus = "idle" | "researching" | "done" | "error";

export default function SkillSelectionPage() {
  const [skill, setSkill] = useState("");
  const [status, setStatus] = useState<ResearchStatus>("idle");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  async function handleResearch() {
    if (!skill.trim() || status === "researching") return;

    setStatus("researching");
    setCurrentStep(1);
    setDocUrl(null);

    try {
      // The API route streams progress via polling — we simulate step progression
      // while waiting for the single POST to complete.
      // Step 1 shown immediately; steps 2 and 3 advance on a timer to match
      // typical pipeline duration (15-40s total per RESEARCH.md open question #2).
      const stepTimer2 = setTimeout(() => setCurrentStep(2), 8000);  // ~8s: grounding done
      const stepTimer3 = setTimeout(() => setCurrentStep(3), 20000); // ~20s: analysis done

      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: skill.trim() }),
      });

      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const data = await res.json();
      if (data.success) {
        setDocUrl(data.docUrl ?? null);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const isResearching = status === "researching";
  const isDisabled = !skill.trim() || isResearching;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-zinc-950">
      <h1 className="text-3xl font-bold text-zinc-50 text-center">
        What do you want to learn?
      </h1>

      <input
        type="text"
        aria-label="Enter a skill to research"
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 w-80 text-base text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        placeholder="e.g. knife skills, juggling, golf swing"
        value={skill}
        onChange={(e) => setSkill(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleResearch()}
        disabled={isResearching}
      />

      <button
        type="button"
        aria-label="Start researching the entered skill"
        className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 py-3 rounded-lg min-h-[44px] w-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        onClick={handleResearch}
        disabled={isDisabled}
      >
        {isResearching ? "Researching..." : "Start Research"}
      </button>

      {status === "done" && (
        <a
          href={`/session?skill=${encodeURIComponent(skill)}`}
          className="bg-green-600 hover:bg-green-500 text-white font-bold text-sm px-6 py-3 rounded-lg min-h-[44px] w-80 flex items-center justify-center transition-colors"
        >
          Start Coaching Session →
        </a>
      )}

      {/* Status panel — shown during researching, done, and error states */}
      {status !== "idle" && (
        <div
          className="bg-zinc-900 rounded-lg px-6 py-4 w-80 flex items-center gap-3"
          role="status"
          aria-live="polite"
        >
          {isResearching && (
            <>
              {/* Spinner */}
              <span
                className="inline-block w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-sm font-bold text-zinc-400">
                {STEP_LABELS[currentStep]}
              </span>
            </>
          )}

          {status === "done" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-zinc-400">Skill document ready</span>
              {docUrl && (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline text-sm hover:text-blue-300"
                >
                  View in Google Docs
                </a>
              )}
            </div>
          )}

          {status === "error" && (
            <p className="text-sm font-bold text-red-400">
              Research failed. Try again or check your connection.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
