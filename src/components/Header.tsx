"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Header() {
  const { data: session } = useSession();
  
  return (
    <header className="w-full p-6 flex justify-between items-center absolute top-0 z-10">
      <div className="font-bold text-xl tracking-tighter flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-zinc-900" />
        </div>
        Glitch
      </div>
      <div>
        {session ? (
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {session.user?.image && (
              <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
            )}
            {session.user?.name?.split(" ")[0]}
          </button>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors border border-zinc-700"
          >
            Sign in with Google
          </button>
        )}
      </div>
    </header>
  );
}
