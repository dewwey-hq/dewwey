import Link from "next/link";
import { BRAND_NAME } from "@/app/lib/brand";

type BetaAccessPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function BetaAccessPage({ searchParams }: BetaAccessPageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/";
  const showError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-rose-500">
          Beta
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">
          {BRAND_NAME}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Enter the staging password to continue.
        </p>

        <form action="/api/beta-access" method="POST" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 outline-none ring-rose-400 focus:ring-2"
            />
          </div>
          {showError ? (
            <p className="text-sm text-red-600">Incorrect password. Try again.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-rose-400 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-500"
          >
            Continue
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-stone-500">
          <Link href="https://dewwey.com" className="underline hover:text-stone-700">
            Go to public site
          </Link>
        </p>
      </div>
    </main>
  );
}
