import { useState } from "react";

/**
 * Local login/registration page for the de-Manus auth seam.
 * Rendered only when the server reports AUTH_PROVIDER=local via
 * GET /api/auth/provider; the Manus OAuth portal flow is untouched otherwise.
 */
export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          mode === "register" ? { email, password, name } : { email, password }
        ),
      });
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setError(body.error || "Sign-in failed. Please try again.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ee] px-4">
      <section className="clinical-panel w-full max-w-md p-8">
        <p className="metric-label">Protected clinic workspace</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#24453e]">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {mode === "login"
            ? "Use your clinic email and password to open a secure session."
            : "The first account created on a fresh installation becomes the clinic administrator."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" && (
            <div>
              <label htmlFor="login-name" className="text-xs font-semibold text-[#24453e]">
                Full name
              </label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-[#d8d3c4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#24453e]"
                placeholder="Dr Amira Vella"
              />
            </div>
          )}
          <div>
            <label htmlFor="login-email" className="text-xs font-semibold text-[#24453e]">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-[#d8d3c4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#24453e]"
              placeholder="you@clinic.example"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs font-semibold text-[#24453e]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={mode === "register" ? 10 : undefined}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-1 w-full rounded-xl border border-[#d8d3c4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#24453e]"
              placeholder={mode === "register" ? "At least 10 characters" : ""}
            />
          </div>
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#24453e] px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in securely" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 text-xs font-semibold text-[#24453e] underline-offset-2 hover:underline"
        >
          {mode === "login"
            ? "First time here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
