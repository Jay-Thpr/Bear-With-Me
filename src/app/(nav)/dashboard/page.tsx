"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import PixelAvatar from "@/components/PixelAvatar";

interface SkillModel {
  sessionPlan?: { primaryFocus?: string };
  metadata?: { goal?: string; level?: string };
}

interface WorkspaceInfo {
  docUrl: string | null;
  rootFolderUrl: string | null;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const skill = searchParams.get("skill") || "";

  const [goal, setGoal] = useState<string>("");
  const [level, setLevel] = useState(1);
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ docUrl: null, rootFolderUrl: null });
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    try {
      const modelJson = sessionStorage.getItem("skillModelJson");
      if (modelJson) {
        const model: SkillModel = JSON.parse(modelJson);
        const derived =
          model.sessionPlan?.primaryFocus ||
          model.metadata?.goal ||
          `Learn the foundational mechanics of ${skill}`;
        setGoal(derived);
        setModelReady(true);
      } else {
        setGoal(`Learn the foundational mechanics of ${skill}`);
      }

      const intakeJson = sessionStorage.getItem("researchIntake");
      if (intakeJson) {
        const intake = JSON.parse(intakeJson);
        const lvlMap: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
        setLevel(lvlMap[intake.level as string] ?? 1);
      }

      const wsJson = sessionStorage.getItem("researchWorkspace");
      if (wsJson) setWorkspace(JSON.parse(wsJson));
    } catch {
      // silently fall through to defaults
    }
  }, [skill]);

  const startSession = () => {
    router.push(`/session?skill=${encodeURIComponent(skill)}`);
  };

  if (!skill) {
    return (
      <div className="page">
        <h1 className="page__title page__title--sm">Quest board</h1>
        <p className="page__lead">No skill selected yet.</p>
        <div className="page__actions">
          <Link href="/onboarding" className="btn btn--primary">
            Set your quest
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title page__title--sm">Quest board</h1>

      <div className="dashboard-grid">
        {/* Avatar + XP */}
        <section className="panel">
          <h2 className="panel__title">Your hero</h2>
          <PixelAvatar skillLabel={skill} level={level} />
          <div className="xp-bar" aria-hidden>
            <div className="xp-bar__fill" style={{ width: "8%" }} />
          </div>
          <p className="panel__meta">New quest — XP starts here</p>
        </section>

        {/* Goal + session start */}
        <section className="panel" style={{ flexGrow: 1 }}>
          <h2 className="panel__title">Session focus</h2>

          {modelReady && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--accent)",
                border: "1.5px solid var(--accent)",
                borderRadius: "999px",
                padding: "0.2rem 0.6rem",
              }}
            >
              Skill model ready
            </span>
          )}

          <p className="panel__body" style={{ fontWeight: 600, color: "var(--text-strong)" }}>
            {goal}
          </p>

          {workspace.docUrl && (
            <a
              href={workspace.docUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.85rem", color: "var(--accent)", textDecoration: "none" }}
            >
              Open research doc →
            </a>
          )}

          <button
            type="button"
            className="btn btn--primary"
            onClick={startSession}
            style={{ marginTop: "0.5rem", width: "100%" }}
          >
            Start live session
          </button>
        </section>
      </div>

      {/* System check */}
      <section className="panel" style={{ maxWidth: "32rem" }}>
        <h2 className="panel__title">System check</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
          <StatusRow label="Skill model" ok={modelReady} />
          <StatusRow label="Research workspace" ok={!!workspace.docUrl} />
          <StatusRow label="Gemini Live" ok={false} note="connects on session start" />
        </div>
      </section>
    </div>
  );
}

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.9rem" }}>
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: ok ? "#22c55e" : "var(--border-strong)",
          flexShrink: 0,
        }}
      />
      <span style={{ color: ok ? "var(--text-strong)" : "var(--text-muted)" }}>{label}</span>
      {note && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>— {note}</span>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="page"><p className="panel__body">Loading…</p></div>}>
      <DashboardContent />
    </Suspense>
  );
}
