"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

const nav = [
  { to: "/", label: "Home" },
  { to: "/onboarding", label: "Goals" },
  { to: "/dashboard", label: "Journey" },
];

export default function NavLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="layout">
      <header className="layout__header">
        <Link href="/" className="layout__brand">
          Skill Quest
        </Link>
        <nav className="layout__nav" aria-label="Main">
          {nav.map(({ to, label }) => (
            <Link key={to} href={to} className="layout__link">
              {label}
            </Link>
          ))}
          {session ? (
            <button
              onClick={() => signOut()}
              className="layout__link flex items-center gap-2"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-6 h-6 rounded-full"
                />
              )}
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {session.user?.name?.split(" ")[0]}
              </span>
            </button>
          ) : (
            <button
              onClick={() => signIn("google", { callbackUrl: window.location.pathname })}
              className="btn btn--ghost"
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem", borderWidth: "2px" }}
            >
              Sign in
            </button>
          )}
        </nav>
      </header>
      <main className="layout__main">{children}</main>
    </div>
  );
}
