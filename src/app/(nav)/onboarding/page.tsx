"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const levels = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof levels)[number];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [skill, setSkill] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [constraints, setConstraints] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skill.trim()) return;

    if (status !== "authenticated") {
      setIsSigningIn(true);
      await signIn("google", {
        callbackUrl: `/onboarding?skill=${encodeURIComponent(skill)}&goal=${encodeURIComponent(goal)}&level=${level}`,
      });
      return;
    }

    const intake = {
      skill: skill.trim(),
      goal: goal.trim() || `Learn ${skill.trim()}`,
      level,
      constraints: constraints.trim(),
    };
    sessionStorage.setItem("researchIntake", JSON.stringify(intake));
    router.push(`/research-loading?skill=${encodeURIComponent(skill.trim())}`);
  };

  return (
    <div className="page">
      <h1 className="page__title page__title--sm">Set your quest</h1>
      <p className="page__lead">
        Tell the system what you want to learn. It will research it and prepare
        your coaching session.
      </p>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Skill</span>
          <input
            className="field__input"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. Guitar, Juggling, Python"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Goal for this skill</span>
          <textarea
            className="field__input field__input--area"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Play a full song without stopping"
            rows={3}
          />
        </label>

        <fieldset className="field">
          <legend className="field__label">Starting level</legend>
          <div className="chip-row">
            {levels.map((l) => (
              <button
                key={l}
                type="button"
                className={`chip ${level === l ? "chip--active" : ""}`}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field__label">Time constraints (optional)</span>
          <input
            className="field__input"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g. 20 minutes per day"
          />
        </label>

        <div className="page__actions" style={{ marginTop: 0 }}>
          <button type="submit" className="btn btn--primary" disabled={isSigningIn}>
            {status !== "authenticated"
              ? isSigningIn
                ? "Redirecting to Google…"
                : "Sign in & start research"
              : "Start research"}
          </button>
        </div>

        {status !== "authenticated" && (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Google Workspace sign-in required — research notes are saved to your
            Drive.
          </p>
        )}
      </form>
    </div>
  );
}
