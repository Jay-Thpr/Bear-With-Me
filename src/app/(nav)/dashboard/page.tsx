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

interface CalendarDay {
  date: number;
  isToday: boolean;
  complete: boolean;
}

const FlameIcon = () => (
  <svg
    className="journey__streak-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="#88a594" strokeWidth="2" />
    <path d="M16 2v4M8 2v4M3 10h18" stroke="#88a594" strokeWidth="2" />
  </svg>
);

const TrophyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m0 5v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M6 9h12m0 0h1.5a2.5 2.5 0 0 0 0-5H18m-6 13V9m0 13H9m3 0h3"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlayIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#b89a60" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const querySkill = searchParams.get("skill") || "";

  const [skill, setSkill] = useState(querySkill);
  const [goal, setGoal] = useState<string>("");
  const [level, setLevel] = useState(1);
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ docUrl: null, rootFolderUrl: null });
  const [modelReady, setModelReady] = useState(false);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);

  useEffect(() => {
    try {
      const intakeJson = sessionStorage.getItem("researchIntake");
      if (querySkill) {
        setSkill(querySkill);
      } else if (intakeJson) {
        const intake = JSON.parse(intakeJson) as { skill?: string; level?: string };
        setSkill(intake.skill?.trim() || "");
        const lvlMap: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
        setLevel(lvlMap[intake.level as string] ?? 1);
      }

      const modelJson = sessionStorage.getItem("skillModelJson");
      if (modelJson) {
        const model: SkillModel = JSON.parse(modelJson);
        const derived = model.sessionPlan?.primaryFocus || model.metadata?.goal || "";
        setGoal(derived);
        setModelReady(true);
      } else {
        setGoal("");
      }

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
  }, [querySkill]);

  useEffect(() => {
    if (!skill) return;
    setGoal((currentGoal) => currentGoal || `Learn the foundational mechanics of ${skill}`);
  }, [skill]);

  useEffect(() => {
    const today = new Date();
    const days = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (27 - i));
      return {
        date: date.getDate(),
        isToday: i === 27,
        complete: (i + date.getDate()) % 3 !== 0,
      };
    });
    setCalendarDays(days);
  }, []);

  const startSession = () => {
    router.push(`/session?skill=${encodeURIComponent(skill)}`);
  };

  const practiceHours = level * 6;
  const completedSessions = level * 8;
  const masteredSkills = Math.max(1, level * 3);
  const progressPercent = modelReady ? Math.min(92, 18 + level * 17) : 8;
  const streak = modelReady ? 7 : 1;
  const milestoneTitle = modelReady ? "Skill model ready" : "Quest created";
  const milestoneCopy = modelReady
    ? "Grounded research synthesized your current focus, session prompt, and workspace notes."
    : "Finish the research pipeline to unlock the generated practice model and workspace brief.";
  const upcoming = [
    {
      session: completedSessions + 1,
      title: "Primary focus",
      desc: goal || `Build stronger fundamentals for ${skill}.`,
      accent: "#88a594",
      bg: "rgba(136,165,148,0.06)",
      border: "rgba(136,165,148,0.18)",
    },
    {
      session: completedSessions + 2,
      title: "Research review",
      desc: workspace.docUrl
        ? "Review the generated research notes and extract one concrete drill."
        : "Research workspace will appear here after the intake pipeline finishes.",
      accent: "#7aaac8",
      bg: "rgba(168,192,216,0.06)",
      border: "rgba(168,192,216,0.18)",
    },
    {
      session: completedSessions + 3,
      title: "Live coaching loop",
      desc: "Use Gemini Live to practice, log corrections, and iterate on the next session.",
      accent: "#b89a60",
      bg: "rgba(232,213,165,0.1)",
      border: "rgba(232,213,165,0.25)",
    },
  ];

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
    <div className="page page--flush journey">
      <div className="journey__header">
        <div>
          <h1 className="page__title">Your journey</h1>
          <p className="page__lead" style={{ marginTop: "0.35rem" }}>
            Continuing {skill} practice
          </p>
        </div>
        <div className="journey__streak">
          <FlameIcon />
          <div>
            <div className="journey__streak-val">{streak}</div>
            <div className="journey__streak-label">Day streak</div>
          </div>
        </div>
      </div>

      <div className="journey__grid">
        <div className="journey__panel">
          <div className="journey__hero-row">
            <div className="journey__avatar-column">
              <div className="journey__avatar-wrap">
                <div className="journey__avatar-bear">
                  <PixelAvatar skillLabel={skill} level={level} />
                  <div className="journey__level-badge" aria-hidden>
                    {level}
                  </div>
                </div>
              </div>
              <p className="journey__avatar-caption">{skill}</p>
            </div>

            <div className="journey__hero-copy">
              <div className="journey__hero-topline">
                <h2 className="page__title page__title--sm" style={{ margin: 0 }}>
                  Level {level} learner
                </h2>
                <span className="journey__hero-subtle">
                  {progressPercent}% to level {level + 1}
                </span>
              </div>
              <div className="xp-bar" aria-hidden>
                <div className="xp-bar__fill" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="journey__stats">
                <div className="journey__stat journey__stat--primary">
                  <div className="journey__stat-val" style={{ color: "#88a594" }}>{completedSessions}</div>
                  <div className="journey__stat-label">Sessions</div>
                </div>
                <div className="journey__stat journey__stat--secondary">
                  <div className="journey__stat-val" style={{ color: "#7aaac8" }}>{practiceHours}h</div>
                  <div className="journey__stat-label">Practice</div>
                </div>
                <div className="journey__stat journey__stat--accent">
                  <div className="journey__stat-val" style={{ color: "#b89a60" }}>{masteredSkills}</div>
                  <div className="journey__stat-label">Milestones</div>
                </div>
              </div>

              <button type="button" className="btn btn--primary btn--lg" onClick={startSession} style={{ marginTop: "1.25rem", width: "100%" }}>
                <PlayIcon />
                Start live session
              </button>
              {workspace.docUrl && (
                <a href={workspace.docUrl} target="_blank" rel="noreferrer" className="journey__workspace-link" style={{ display: "inline-block", marginTop: "0.85rem" }}>
                  Open research doc
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="journey__panel journey__panel--blue">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "3rem",
                height: "3rem",
                borderRadius: "16px",
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg, #a8c0d8 0%, #8aafc8 100%)",
                boxShadow: "0 4px 12px rgba(100, 140, 180, 0.25)",
              }}
            >
              <TrophyIcon />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Recent milestone</h3>
              <p style={{ margin: "0.15rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {modelReady ? "Unlocked just now" : "Waiting on research"}
              </p>
            </div>
          </div>
          <div className="journey__milestone-card">
            <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>{milestoneTitle}</p>
            <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              {milestoneCopy}
            </p>
          </div>
        </div>
      </div>

      <div className="journey__panel">
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div
            style={{
              padding: "0.45rem",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(136,165,148,0.2) 0%, rgba(136,165,148,0.1) 100%)",
              border: "1px solid rgba(136,165,148,0.2)",
            }}
          >
            <CalendarIcon />
          </div>
          <h3 className="journey__section-title" style={{ margin: 0 }}>
            Practice log
          </h3>
        </div>
        <div className="journey__cal">
          {calendarDays.map((day, index) => (
            <div key={`${day.date}-${index}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
              <div
                className="journey__cal-day"
                style={
                  day.complete
                    ? day.isToday
                      ? {
                          background: "linear-gradient(135deg, #88a594 0%, #6d9279 100%)",
                          color: "#ffffff",
                          boxShadow: "0 3px 10px rgba(88, 130, 100, 0.3)",
                        }
                      : {
                          background: "rgba(136, 165, 148, 0.18)",
                          color: "#5a8068",
                          border: "1px solid rgba(136, 165, 148, 0.3)",
                        }
                    : {
                        background: "rgba(244, 243, 239, 0.8)",
                        color: "#b0ada7",
                      }
                }
                title={day.complete ? "Session completed" : "No session"}
              >
                {day.date}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="journey__panel">
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "1rem" }}>
          <div
            style={{
              padding: "0.45rem",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(232,213,165,0.3) 0%, rgba(232,213,165,0.15) 100%)",
              border: "1px solid rgba(232,213,165,0.35)",
            }}
          >
            <ZapIcon />
          </div>
          <h3 className="journey__section-title" style={{ margin: 0 }}>
            Upcoming practices
          </h3>
        </div>
        <div className="journey__upcoming">
          {upcoming.map((item) => (
            <div
              key={item.session}
              className="journey__up-card"
              style={{
                background: item.bg,
                border: `1px solid ${item.border}`,
              }}
            >
              <div
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: item.accent,
                  marginBottom: "0.5rem",
                }}
              >
                Session {item.session}
              </div>
              <h4 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>{item.title}</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
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
