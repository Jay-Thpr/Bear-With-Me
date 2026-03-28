"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApiStatus = "checking" | "ok" | "error";

export default function HomePage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setApiStatus("ok") : setApiStatus("error")))
      .catch(() => setApiStatus("error"));
  }, []);

  return (
    <div className="page page--home">
      <p className="page__kicker">UCLA Glitch × DeepMind</p>
      <h1 className="page__title">Level up any skill</h1>
      <p className="page__lead">
        Research-backed coaching, live feedback, and a pixel hero that grows
        with you. Pick a skill, run the research, then jump into a session.
      </p>
      <div className="page__actions">
        <Link href="/onboarding" className="btn btn--primary">
          Start your quest
        </Link>
        <Link href="/dashboard" className="btn btn--ghost">
          Quest board
        </Link>
      </div>
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
  );
}
