"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SiteHeader } from "@/app/components/SiteHeader";
import { displayHeadingClassName } from "@/lib/typography";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-20">
        <h1 className={`${displayHeadingClassName} text-3xl text-gray-900`}>
          Keep your team
        </h1>
        <p className="mt-2 text-gray-500">
          Sign in with a magic link. Your team saves to your account and follows
          you across devices.
        </p>

        <button
          onClick={async () => {
            const supabase = supabaseBrowser();
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/auth/callback` },
            });
          }}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.10] bg-white px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-black/[0.04]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-black/[0.10]" /> or <span className="h-px flex-1 bg-black/[0.10]" />
        </div>

        {state === "sent" ? (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            Check your email. The sign-in link is on its way to{" "}
            <span className="font-medium">{email}</span>.
          </div>
        ) : (
          <form onSubmit={sendLink} className="mt-8 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-black/[0.10] bg-white px-4 py-3 outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded-xl bg-rose-500 px-4 py-3 font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </form>
        )}
      </main>
    </div>
  );
}
