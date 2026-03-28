export default function SessionPage({
  searchParams,
}: {
  searchParams: { skill?: string };
}) {
  const skill = searchParams.skill ?? "unknown skill";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-zinc-950">
      <h1 className="text-3xl font-bold text-zinc-50 text-center">
        Live Coaching Session
      </h1>
      <p className="text-zinc-400 text-center">
        Skill: <span className="text-zinc-50 font-semibold">{skill}</span>
      </p>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-6 py-4 text-zinc-500 text-sm text-center">
        Phase 2 — coming next
      </div>
    </main>
  );
}
