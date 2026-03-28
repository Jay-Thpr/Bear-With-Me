"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const levels = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof levels)[number];
const TEMP_DISABLE_RESEARCH = true;

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [skill, setSkill] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [constraints, setConstraints] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSkill = params.get("skill");
    const nextGoal = params.get("goal");
    const nextLevel = params.get("level");

    if (nextSkill) setSkill(nextSkill);
    if (nextGoal) setGoal(nextGoal);
    if (nextLevel && levels.includes(nextLevel as Level)) {
      setLevel(nextLevel as Level);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skill.trim()) return;

    if (status !== "authenticated") {
      setIsSigningIn(true);
      await signIn("google", {
        callbackUrl:
          `/onboarding?skill=${encodeURIComponent(skill)}&goal=${encodeURIComponent(goal)}&level=${level}`,
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

    if (TEMP_DISABLE_RESEARCH) {
      const mockSkillModel = {
        metadata: {
          skill: intake.skill,
          goal: intake.goal,
          level: intake.level,
        },
        sessionPlan: {
          primaryFocus: `Core ${intake.skill} fundamentals`,
          secondaryFocus: `Build consistency toward: ${intake.goal}`,
          warmupActivity: `Spend 2 minutes resetting your form for ${intake.skill}`,
          keyCheckpoints: [
            "Keep movements controlled and repeatable",
            "Focus on one correction at a time",
            "End the session with one measurable improvement",
          ],
          successIndicators: [
            "Form is more consistent than at the start",
            "You can describe the main correction in plain language",
          ],
        },
      };

      sessionStorage.setItem("skillModelJson", JSON.stringify(mockSkillModel));
      sessionStorage.setItem(
        "systemPrompt",
        `You are a real-time coaching assistant helping the user practice ${intake.skill}. Give concise, specific feedback.`,
      );
      sessionStorage.setItem(
        "researchWorkspace",
        JSON.stringify({
          docUrl: null,
          rootFolderUrl: null,
        }),
      );
      router.push(`/dashboard?skill=${encodeURIComponent(intake.skill)}`);
      return;
    }

    router.push(`/research-loading?skill=${encodeURIComponent(skill.trim())}`);
  };

  return (
    <div className="page page--onboarding">
      <form className="form-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: "center", marginBottom: "0.25rem" }}>
          <h1 className="page__title page__title--sm" style={{ marginBottom: "0.35rem" }}>
            Set your quest
          </h1>
          <p className="page__lead" style={{ margin: "0 auto", maxWidth: "28rem" }}>
            Tell the system what you are building toward. Research runs before
            the live session so your coaching is grounded in the actual skill.
          </p>
        </div>

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
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
            Google Workspace sign-in required. Research notes are saved to your
            Drive.
          </p>
        )}
      </form>
    </div>
  );
}
