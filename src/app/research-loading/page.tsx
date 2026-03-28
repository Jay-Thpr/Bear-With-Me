"use client";

import { motion } from "framer-motion";
import { Search, PlaySquare, Target, CheckCircle2, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import type { ClarificationAnswer, ClarificationQuestion } from "../../../lib/research-types";

function classifyStep(message: string): string {
  if (message.includes("📺") || message.includes("video") || message.includes("Analyzed")) return "youtube";
  if (message.includes("🔍") || message.includes("Searching")) return "search";
  if (message.includes("✅") || message.includes("ready") || message.includes("complete")) return "check";
  return "target";
}

function ResearchLoadingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") || "the skill";

  const [activeSteps, setActiveSteps] = useState<Array<{ id: number; text: string; type: string }>>([]);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const isDoneRef = useRef(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const runResearch = async (answersOverride?: ClarificationAnswer[]) => {
      try {
        const intake = readResearchIntake(skill);
        const effectiveAnswers =
          answersOverride ??
          Object.entries(clarificationAnswers).map(([questionId, answer]) => ({ questionId, answer }));

        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...intake,
            clarificationAnswers: effectiveAnswers,
          }),
        });

        if (!res.ok || !res.body) {
          console.error("[research-loading] Request failed:", res.status);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || !isMounted) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE events from buffer (split on double newline)
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(chunk.slice(6));
              handleEvent(data);
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        console.error("[research-loading] SSE error:", err);
      }
    };

    const handleEvent = (data: { type: string; message?: string; url?: string; skillModelJson?: string; skillModel?: unknown; systemPrompt?: string; docUrl?: string; questions?: ClarificationQuestion[] }) => {
      switch (data.type) {
        case "status":
          if (isMounted) {
            setActiveSteps(prev => [
              ...prev,
              { id: Date.now(), text: data.message || "", type: classifyStep(data.message || "") },
            ]);
            setProgress(p => Math.min(p + 12, 90));
          }
          break;

        case "illustration":
          if (isMounted && data.url) {
            sessionStorage.setItem("illustrationUrl", data.url);
          }
          break;

        case "clarification_required":
          if (isMounted) {
            setClarificationQuestions(data.questions || []);
            setProgress(20);
          }
          break;

        case "done":
          if (!isMounted) break;
          isDoneRef.current = true;
          try {
            sessionStorage.setItem("skillModelJson", data.skillModelJson || JSON.stringify(data.skillModel || {}));
            sessionStorage.setItem("systemPrompt", data.systemPrompt || "");
            sessionStorage.setItem("docId", data.docUrl?.split("/d/")[1]?.split("/")[0] || "");
          } catch {
            // sessionStorage write failed — continue anyway
          }
          setProgress(100);
          setIsComplete(true);
          setTimeout(() => {
            if (isMounted) router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`);
          }, 1500);
          break;

        case "error":
          console.error("[research-loading] Pipeline error:", data.message);
          if (isMounted) {
            isDoneRef.current = true;
            setIsComplete(true);
          }
          break;
      }
    };

    // 20-second safety timeout — navigate anyway with a minimal demo skill model
    const safetyTimeout = setTimeout(() => {
      if (!isMounted) return;
      if (!isDoneRef.current && clarificationQuestions.length === 0) {
        console.warn("[research-loading] Timeout — falling back to demo mode");
        try {
          const intake = readResearchIntake(skill);
          const demoModel = {
            metadata: { skill: intake.skill, goal: intake.goal, level: intake.level },
            sessionPlan: { primaryFocus: `Learn the fundamentals of ${skill}` },
          };
          sessionStorage.setItem("skillModelJson", JSON.stringify(demoModel));
          sessionStorage.setItem("systemPrompt", "");
        } catch {
          // ignore
        }
        setProgress(100);
        setIsComplete(true);
        router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`);
      }
    }, 20000);

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      void runResearch();
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
    };
  }, [skill, clarificationQuestions.length, clarificationAnswers]); // eslint-disable-line

  const handleClarificationSubmit = async () => {
    const answers = clarificationQuestions.map((question) => ({
      questionId: question.id,
      answer: clarificationAnswers[question.id] || "",
    }));

    sessionStorage.setItem("researchClarificationAnswers", JSON.stringify(answers));
    setClarificationQuestions([]);
    setActiveSteps((prev) => [
      ...prev,
      { id: Date.now(), text: "Clarification answers captured. Resuming research...", type: "check" },
    ]);
    await (async () => {
      try {
        const intake = readResearchIntake(skill);
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...intake,
            clarificationAnswers: answers,
          }),
        });

        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            const data = JSON.parse(chunk.slice(6));
            if (data.type === "status") {
              setActiveSteps((prev) => [
                ...prev,
                { id: Date.now(), text: data.message || "", type: classifyStep(data.message || "") },
              ]);
              setProgress((p) => Math.min(p + 12, 90));
            } else if (data.type === "done") {
              isDoneRef.current = true;
              sessionStorage.setItem("skillModelJson", data.skillModelJson || JSON.stringify(data.skillModel || {}));
              sessionStorage.setItem("systemPrompt", data.systemPrompt || "");
              sessionStorage.setItem("docId", data.docUrl?.split("/d/")[1]?.split("/")[0] || "");
              setProgress(100);
              setIsComplete(true);
              setTimeout(() => router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`), 1500);
            } else if (data.type === "illustration" && data.url) {
              sessionStorage.setItem("illustrationUrl", data.url);
            }
          }
        }
      } catch (error) {
        console.error("[research-loading] Clarification resume failed:", error);
      }
    })();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "search": return <Search className="w-5 h-5 text-blue-400" />;
      case "youtube": return <PlaySquare className="w-5 h-5 text-red-500" />;
      case "target": return <Target className="w-5 h-5 text-amber-400" />;
      case "check": return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      default: return <Search className="w-5 h-5" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"
      />

      <div className="max-w-2xl w-full z-10 flex flex-col items-center">

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-12 flex items-center gap-3">
          Learning about {skill}
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="inline-block w-2 h-2 rounded-full bg-emerald-500 mb-1"
          />
        </h1>

        <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 min-h-[300px] max-h-[300px] overflow-hidden flex flex-col justify-end shadow-2xl relative">

          {/* Fading overlay at top to mask incoming items nicely */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-zinc-900/50 to-transparent z-10" />

          <div className="flex flex-col gap-4 relative z-0">
            {activeSteps.map((step) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto", marginBottom: 16 }}
                className="flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0 bg-zinc-800 p-2 rounded-lg">
                  {getIcon(step.type)}
                </div>
                <div className="text-zinc-300 font-medium py-1">
                  {step.text}
                </div>
              </motion.div>
            ))}
          </div>

        </div>

        {clarificationQuestions.length > 0 ? (
          <div className="mt-6 w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <div className="text-xs uppercase tracking-widest text-amber-300">Clarification Needed</div>
            <div className="mt-4 space-y-4">
              {clarificationQuestions.map((question) => (
                <div key={question.id}>
                  <div className="mb-2 text-sm font-medium text-white">{question.question}</div>
                  {question.type === "multiple_choice" && question.options?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setClarificationAnswers((prev) => ({ ...prev, [question.id]: option }))}
                          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                            clarificationAnswers[question.id] === option
                              ? "border-amber-400 bg-amber-400/10 text-amber-200"
                              : "border-zinc-700 bg-zinc-900 text-zinc-300"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      rows={3}
                      value={clarificationAnswers[question.id] || ""}
                      onChange={(e) => setClarificationAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                  )}
                  <div className="mt-2 text-xs text-zinc-500">{question.reason}</div>
                </div>
              ))}
            </div>
            <button
              onClick={handleClarificationSubmit}
              className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              Continue research
            </button>
          </div>
        ) : null}

        {/* Progress Bar */}
        <div className="w-full mt-10">
          <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <motion.div
              className="h-full bg-emerald-500 relative"
              style={{ width: `${progress}%` }}
              layout
            >
              <div className="absolute inset-0 bg-white/20" />
            </motion.div>
          </div>
          <div className="mt-4 flex justify-between items-center h-10">
            <span className="text-sm text-zinc-500 font-mono">
              {Math.floor(progress)}% prepared
            </span>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isComplete ? 1 : 0 }}
              onClick={() => router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`)}
              className="flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Begin Session <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

      </div>
    </div>
  );
}

function readResearchIntake(skill: string) {
  try {
    const raw = sessionStorage.getItem("researchIntake");
    if (!raw) {
      return {
        skill,
        goal: `Learn ${skill}`,
        level: "beginner",
      };
    }
    const parsed = JSON.parse(raw);
    return {
      skill: parsed.skill || skill,
      goal: parsed.goal || `Learn ${skill}`,
      level: parsed.level || "beginner",
      preferences: parsed.preferences || "",
      constraints: parsed.constraints || "",
      environment: parsed.environment || "",
      equipment: parsed.equipment || [],
    };
  } catch {
    return {
      skill,
      goal: `Learn ${skill}`,
      level: "beginner",
    };
  }
}

export default function ResearchLoading() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
      <ResearchLoadingContent />
    </Suspense>
  )
}
