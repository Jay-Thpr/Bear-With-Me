"use client";

import { motion } from "framer-motion";
import { Search, PlaySquare, Target, CheckCircle2, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function classifyStep(message: string): string {
  if (message.includes("📺") || message.includes("video") || message.includes("Analyzed")) return "youtube";
  if (message.includes("🔍") || message.includes("🌐") || message.includes("Searching")) return "search";
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
  const [currentResearchTarget, setCurrentResearchTarget] = useState("Preparing the research workspace...");
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [rootFolderUrl, setRootFolderUrl] = useState<string | null>(null);
  const isDoneRef = useRef(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const handleEvent = (data: {
      type: string;
      message?: string;
      url?: string;
      skillModelJson?: string;
      skillModel?: unknown;
      systemPrompt?: string;
      docUrl?: string;
      rootFolderUrl?: string;
    }) => {
      switch (data.type) {
        case "status":
          if (!isMounted) break;
          setCurrentResearchTarget(data.message || "Researching...");
          setActiveSteps((prev) => [
            ...prev,
            { id: Date.now() + Math.random(), text: data.message || "", type: classifyStep(data.message || "") },
          ]);
          setProgress((value) => Math.min(value + 10, 90));
          break;
        case "workspace":
          if (!isMounted) break;
          setDocUrl(data.docUrl || null);
          setRootFolderUrl(data.rootFolderUrl || null);
          sessionStorage.setItem(
            "researchWorkspace",
            JSON.stringify({
              docUrl: data.docUrl || null,
              rootFolderUrl: data.rootFolderUrl || null,
            })
          );
          break;
        case "illustration":
          if (isMounted && data.url) {
            sessionStorage.setItem("illustrationUrl", data.url);
          }
          break;
        case "done":
          if (!isMounted) break;
          isDoneRef.current = true;
          sessionStorage.setItem("skillModelJson", data.skillModelJson || JSON.stringify(data.skillModel || {}));
          sessionStorage.setItem("systemPrompt", data.systemPrompt || "");
          sessionStorage.setItem("docId", data.docUrl?.split("/d/")[1]?.split("/")[0] || "");
          if (data.docUrl) {
            setDocUrl(data.docUrl);
          }
          if (data.rootFolderUrl) {
            setRootFolderUrl(data.rootFolderUrl);
          }
          setCurrentResearchTarget("Research complete");
          setProgress(100);
          setIsComplete(true);
          break;
        case "error":
          console.error("[research-loading] Pipeline error:", data.message);
          if (isMounted) {
            isDoneRef.current = true;
            setIsComplete(true);
            setCurrentResearchTarget(data.message || "Research failed");
          }
          break;
      }
    };

    const runResearch = async () => {
      try {
        const intake = readResearchIntake(skill);
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(intake),
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
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              handleEvent(JSON.parse(chunk.slice(6)));
            } catch {
              // Ignore malformed SSE chunks.
            }
          }
        }
      } catch (error) {
        console.error("[research-loading] SSE error:", error);
      }
    };

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      void runResearch();
    }

    return () => {
      isMounted = false;
    };
  }, [router, skill]);

  const getIcon = (type: string) => {
    switch (type) {
      case "search":
        return <Search className="h-5 w-5 text-blue-400" />;
      case "youtube":
        return <PlaySquare className="h-5 w-5 text-red-500" />;
      case "target":
        return <Target className="h-5 w-5 text-amber-400" />;
      case "check":
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
      default:
        return <Search className="h-5 w-5" />;
    }
  };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[120px]"
      />

      <div className="z-10 flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-12 flex items-center gap-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
          Learning about {skill}
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="mb-1 inline-block h-2 w-2 rounded-full bg-emerald-500"
          />
        </h1>

        <div className="relative flex min-h-[300px] max-h-[300px] w-full flex-col justify-end overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl">
          <div className="absolute left-0 right-0 top-0 z-10 h-16 bg-gradient-to-b from-zinc-900/50 to-transparent" />

          <div className="absolute inset-x-0 top-8 z-20 flex flex-col items-center gap-3 px-6 text-center">
            <div className="text-xs uppercase tracking-[0.28em] text-zinc-500">Currently Researching</div>
            <div className="max-w-xl text-lg font-semibold text-white md:text-xl">{currentResearchTarget}</div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              {docUrl ? (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-300"
                >
                  Open research doc
                </a>
              ) : null}
              {rootFolderUrl ? (
                <a
                  href={rootFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-zinc-300"
                >
                  Open Drive folder
                </a>
              ) : null}
            </div>
          </div>

          <div className="relative z-0 flex flex-col gap-4">
            {activeSteps.map((step) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto", marginBottom: 16 }}
                className="flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800 p-2">{getIcon(step.type)}</div>
                <div className="py-1 font-medium text-zinc-300">{step.text}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-10 w-full">
          <div className="h-2 w-full overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
            <motion.div className="relative h-full bg-emerald-500" style={{ width: `${progress}%` }} layout>
              <div className="absolute inset-0 bg-white/20" />
            </motion.div>
          </div>
          <div className="mt-4 flex h-10 items-center justify-between">
            <span className="font-mono text-sm text-zinc-500">{Math.floor(progress)}% prepared</span>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isComplete ? 1 : 0 }}
              onClick={() => { if (isComplete) router.push(`/dashboard?skill=${encodeURIComponent(skill)}`); }}
              disabled={!isComplete}
              style={{ pointerEvents: isComplete ? "auto" : "none" }}
              className="flex items-center gap-2 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300 disabled:cursor-not-allowed"
            >
              Continue to Briefing <ArrowRight className="h-4 w-4" />
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
      workspace: parsed.workspace || undefined,
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
    <Suspense fallback={<div className="flex flex-1 items-center justify-center">Loading...</div>}>
      <ResearchLoadingContent />
    </Suspense>
  );
}
