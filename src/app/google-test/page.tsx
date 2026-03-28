"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";

export const dynamic = "force-dynamic";

export default function GoogleTestPage() {
  const { data: session, status } = useSession();
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [docText, setDocText] = useState<string | null>(null);
  const [workspaceLinks, setWorkspaceLinks] = useState<{
    rootFolderUrl: string | null;
    researchFolderUrl: string | null;
    progressFolderUrl: string | null;
    researchDocUrl: string | null;
    progressDocUrl: string | null;
  } | null>(null);
  const [workspacePreview, setWorkspacePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [readingDoc, setReadingDoc] = useState(false);
  const [buildingWorkspace, setBuildingWorkspace] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setDocUrl(null);
    setCalendarUrl(null);
    setDocTitle(null);
    setDocText(null);
    setWorkspaceLinks(null);
    setWorkspacePreview(null);

    try {
      const res = await fetch("/api/google/test", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setDocUrl(data.docUrl || null);
      setCalendarUrl(data.calendarUrl || null);
    } catch (err: any) {
      setError(err?.message || "Test failed.");
    } finally {
      setLoading(false);
    }
  };

  const buildWorkspaceDocs = async () => {
    setBuildingWorkspace(true);
    setError(null);
    setWorkspaceLinks(null);
    setWorkspacePreview(null);

    try {
      const res = await fetch("/api/google/workspace-docs", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setWorkspaceLinks({
        rootFolderUrl: data.rootFolderUrl || null,
        researchFolderUrl: data.researchFolderUrl || null,
        progressFolderUrl: data.progressFolderUrl || null,
        researchDocUrl: data.researchDocUrl || null,
        progressDocUrl: data.progressDocUrl || null,
      });
      setWorkspacePreview(data.researchDocPreview || "");
    } catch (err: any) {
      setError(err?.message || "Workspace doc generation failed.");
    } finally {
      setBuildingWorkspace(false);
    }
  };

  const readDoc = async () => {
    if (!docUrl) return;

    setReadingDoc(true);
    setError(null);

    try {
      const res = await fetch("/api/google/read-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setDocTitle(data.title || null);
      setDocText(data.text || "");
    } catch (err: any) {
      setError(err?.message || "Doc read failed.");
    } finally {
      setReadingDoc(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white">Google Auth Test</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Sign in with Google, then create a test Doc and a Calendar event for tomorrow at 2:00 PM.
        </p>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-xs uppercase tracking-widest text-zinc-500">Account</div>
          {status === "loading" ? (
            <p className="mt-3 text-sm text-zinc-400">Checking session...</p>
          ) : session ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm text-white">{session.user?.name || "Signed in"}</div>
              <div className="text-sm text-zinc-400">{session.user?.email}</div>
              <button
                onClick={() => signOut()}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button
                onClick={() => signIn("google", { callbackUrl: "/google-test" })}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
              >
                Sign in with Google
              </button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={runTest}
            disabled={!session || loading}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {loading ? "Running Google write test..." : "Create test Doc and Calendar event"}
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={readDoc}
            disabled={!session || !docUrl || readingDoc}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
          >
            {readingDoc ? "Reading Google Doc..." : "Read back the test Doc"}
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={buildWorkspaceDocs}
            disabled={!session || buildingWorkspace}
            className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
          >
            {buildingWorkspace ? "Creating Drive folders and formatted Docs..." : "Create research + progress docs in Drive"}
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {docUrl || calendarUrl ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Results</div>
            {docUrl ? (
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-emerald-400 hover:text-emerald-300"
              >
                Open test Google Doc
              </a>
            ) : null}
            {calendarUrl ? (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-blue-400 hover:text-blue-300"
              >
                Open test Calendar event
              </a>
            ) : null}
          </div>
        ) : null}

        {docText !== null ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Doc Contents</div>
            {docTitle ? <div className="mt-3 text-sm font-semibold text-white">{docTitle}</div> : null}
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
              {docText}
            </pre>
          </div>
        ) : null}

        {workspaceLinks ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Workspace Docs</div>
            <div className="mt-3 space-y-2">
              {workspaceLinks.rootFolderUrl ? (
                <a href={workspaceLinks.rootFolderUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-amber-400 hover:text-amber-300">
                  Open root Drive folder
                </a>
              ) : null}
              {workspaceLinks.researchFolderUrl ? (
                <a href={workspaceLinks.researchFolderUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-amber-400 hover:text-amber-300">
                  Open research folder
                </a>
              ) : null}
              {workspaceLinks.progressFolderUrl ? (
                <a href={workspaceLinks.progressFolderUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-amber-400 hover:text-amber-300">
                  Open progress folder
                </a>
              ) : null}
              {workspaceLinks.researchDocUrl ? (
                <a href={workspaceLinks.researchDocUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-emerald-400 hover:text-emerald-300">
                  Open research doc
                </a>
              ) : null}
              {workspaceLinks.progressDocUrl ? (
                <a href={workspaceLinks.progressDocUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-emerald-400 hover:text-emerald-300">
                  Open progress doc
                </a>
              ) : null}
            </div>

            {workspacePreview !== null ? (
              <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
                {workspacePreview}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
