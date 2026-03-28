"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Search, PlaySquare, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ClarificationQuestion } from "../../lib/research-types";

function classifyStep(message: string): string {
  if (message.includes("📺") || message.includes("video") || message.includes("Analyzed")) return "youtube";
  if (message.includes("🔍") || message.includes("research")) return "search";
  if (message.includes("✅") || message.includes("ready") || message.includes("saved")) return "check";
  return "target";
}

export default function StartScreen() {
  const router = useRouter();
  const [skill, setSkill] = useState("Knife skills");
  const [goal, setGoal] = useState("Learn the fundamentals and basic rocking cut");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [preferences, setPreferences] = useState("Visual feedback, calm tone, short corrections");
  const [constraints, setConstraints] = useState("10 minute practice block");
  const [environment, setEnvironment] = useState("Kitchen counter with overhead lighting");
  const [equipment, setEquipment] = useState("Chef's knife, cutting board");
  const [activeSteps, setActiveSteps] = useState<Array<{ id: number; text: string; type: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const latestStatus = useMemo(
    () => activeSteps[activeSteps.length - 1]?.text || "Waiting to start research",
    [activeSteps]
  );

  const runResearch = async (answers?: Array<{ questionId: string; answer: string }>) => {
    setIsRunning(true);
    setError(null);
    if (!answers) {
      setActiveSteps([]);
      setClarificationQuestions([]);
      setClarificationAnswers({});
    }

    const intake = {
      skill,
      goal,
      level,
      preferences,
      constraints,
      environment,
      equipment: equipment.split(",").map((item) => item.trim()).filter(Boolean),
      clarificationAnswers: answers || [],
    };

    sessionStorage.setItem("researchIntake", JSON.stringify(intake));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intake),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Research request failed (${res.status})`);
      }

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
              { id: Date.now() + Math.random(), text: data.message || "", type: classifyStep(data.message || "") },
            ]);
          } else if (data.type === "illustration" && data.url) {
            sessionStorage.setItem("illustrationUrl", data.url);
          } else if (data.type === "clarification_required") {
            setClarificationQuestions(data.questions || []);
            setIsRunning(false);
            return;
          } else if (data.type === "done") {
            sessionStorage.setItem("skillModelJson", data.skillModelJson || JSON.stringify(data.skillModel || {}));
            sessionStorage.setItem("systemPrompt", data.systemPrompt || "");
            sessionStorage.setItem("docId", data.docUrl?.split("/d/")[1]?.split("/")[0] || "");
            router.push(`/session-briefing?skill=${encodeURIComponent(skill)}`);
            return;
          } else if (data.type === "error") {
            throw new Error(data.message || "Research failed");
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Research failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const submitClarifications = async () => {
    const answers = clarificationQuestions.map((question) => ({
      questionId: question.id,
      answer: clarificationAnswers[question.id] || "",
    }));
    setClarificationQuestions([]);
    setActiveSteps((prev) => [
      ...prev,
      { id: Date.now(), text: "Clarification answers captured. Resuming research...", type: "check" },
    ]);
    await runResearch(answers);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "search":
        return <Search className="w-4 h-4 text-blue-400" />;
      case "youtube":
        return <PlaySquare className="w-4 h-4 text-red-400" />;
      case "check":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      default:
        return <Target className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="flex-1 px-6 py-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="flex flex-col justify-between rounded-[32px] border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Research-first coaching engine
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
                Start with a conversation. Then let the system teach itself.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
                Describe the skill, your goal, and how you like to learn. The app will parse your preferences,
                clarify anything important, research the skill, and build your coaching model.
              </p>
            </motion.div>

            <div className="mt-8 space-y-4 rounded-[28px] border border-zinc-800 bg-zinc-900/60 p-6">
              <textarea
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                rows={1}
                className="w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="What do you want to learn?"
              />
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="What exactly are you trying to improve?"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <textarea
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Preferences"
                />
                <textarea
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Constraints"
                />
                <input
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Environment"
                />
                <input
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Equipment"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["beginner", "intermediate", "advanced"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setLevel(option)}
                    className={`rounded-full border px-3 py-2 text-sm capitalize ${
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
          </div>

          <div className="mt-8 rounded-[28px] border border-zinc-800 bg-black/40 p-4">
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Research chat</div>
                <div className="mt-1 text-sm text-zinc-400">
                  {isRunning ? latestStatus : clarificationQuestions.length > 0 ? "Waiting for clarification answers" : "Ready to start research"}
                </div>
              </div>
              <button
                onClick={() => void runResearch()}
                disabled={isRunning || !skill.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {isRunning ? "Researching..." : "Start"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {error ? (
              <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Live Research Status</div>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-sm text-white">
              {latestStatus}
            </div>
            <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {activeSteps.length === 0 ? (
                <div className="text-sm text-zinc-500">No research events yet.</div>
              ) : (
                activeSteps.map((step) => (
                  <div key={step.id} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
                    <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800 p-2">
                      {getIcon(step.type)}
                    </div>
                    <div className="text-sm text-zinc-300">{step.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {clarificationQuestions.length > 0 ? (
            <div className="rounded-[32px] border border-amber-500/20 bg-amber-500/5 p-6 shadow-2xl">
              <div className="text-xs uppercase tracking-widest text-amber-300">Clarification</div>
              <div className="mt-4 space-y-4">
                {clarificationQuestions.map((question) => (
                  <div key={question.id}>
                    <div className="mb-2 text-sm font-medium text-white">{question.question}</div>
                    {question.type === "multiple_choice" && question.options?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {question.options.map((option) => (
                          <button
                            key={option}
                            onClick={() =>
                              setClarificationAnswers((prev) => ({ ...prev, [question.id]: option }))
                            }
                            className={`rounded-lg border px-3 py-2 text-sm ${
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
                        onChange={(e) =>
                          setClarificationAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                      />
                    )}
                    <div className="mt-2 text-xs text-zinc-500">{question.reason}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => void submitClarifications()}
                className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
              >
                Continue research
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
