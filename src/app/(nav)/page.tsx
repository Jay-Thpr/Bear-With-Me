"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApiStatus = "checking" | "ok" | "error";
const STEPS = [
  "Choose your skill.",
  "Run deep research.",
  "Build your live roadmap.",
  "Practice on camera.",
  "Iterate with feedback.",
];

export default function HomePage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setApiStatus("ok") : setApiStatus("error")))
      .catch(() => setApiStatus("error"));
  }, []);

  return (
    <div className="page page--home">
      <div className="landing">
        <div className="landing__bg-css" aria-hidden />
        <div className="landing__wash" aria-hidden />
        <div className="landing__grid-tex" aria-hidden />
        <div className="landing__orb landing__orb--1" aria-hidden />
        <div className="landing__orb landing__orb--2" aria-hidden />
        <div className="landing__orb landing__orb--3" aria-hidden />

        <div className="landing__inner">
          <div className="landing__card">
            <div className="landing__card-highlight" aria-hidden />
            <p className="page__kicker" style={{ marginBottom: "0.75rem" }}>
              UCLA Glitch × DeepMind
            </p>
            <h1 className="landing__headline">Master any skill</h1>
            <ol className="landing__steps">
              {STEPS.map((text, i) => (
                <li key={text} className="landing__step">
                  <span className="landing__step-num">{i + 1}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <div className="landing__ctas">
              <Link href="/onboarding" className="btn btn--primary btn--lg">
                Start your journey
              </Link>
              <Link href="/dashboard" className="btn btn--ghost btn--lg">
                Continue your journey
              </Link>
            </div>
            <div className="landing__api">
              <div
                className={`api-pill api-pill--${apiStatus}`}
                role="status"
                aria-live="polite"
              >
                API:{" "}
                {apiStatus === "checking" && "checking…"}
                {apiStatus === "ok" && "connected"}
                {apiStatus === "error" && "offline"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
