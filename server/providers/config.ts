// De-Manus runtime seams (WINDOW_C4 Stage 3) — provider selection.
//
// Every seam defaults to the Manus-era provider so behaviour is EXACTLY what
// shipped until the operator flips an env var. Nothing Manus is deleted; the
// alternates are additive and reversible (unset the vars to go back).
//
//   AUTH_PROVIDER      = manus (default) | local
//   STORAGE_PROVIDER   = forge (default) | s3
//   SCHEDULER_PROVIDER = manus (default) | internal
//
// Values are read from process.env at call time (not import time) so tests and
// tooling can flip providers without module-cache gymnastics.

export type AuthProvider = "manus" | "local";
export type StorageProvider = "forge" | "s3";
export type SchedulerProvider = "manus" | "internal";

function readProvider<T extends string>(
  envKey: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return fallback;
  const value = raw.trim().toLowerCase() as T;
  if (!allowed.includes(value)) {
    throw new Error(
      `Invalid ${envKey}="${raw}" — expected one of: ${allowed.join(", ")}`
    );
  }
  return value;
}

export function getAuthProvider(): AuthProvider {
  return readProvider("AUTH_PROVIDER", ["manus", "local"] as const, "manus");
}

export function getStorageProvider(): StorageProvider {
  return readProvider("STORAGE_PROVIDER", ["forge", "s3"] as const, "forge");
}

export function getSchedulerProvider(): SchedulerProvider {
  return readProvider(
    "SCHEDULER_PROVIDER",
    ["manus", "internal"] as const,
    "manus"
  );
}

/** Shared secret allowing an EXTERNAL cron to hit /api/scheduled/* endpoints
 * (alternative to both the Manus cron identity and the internal scheduler). */
export function getScheduledJobsSecret(): string {
  return process.env.SCHEDULED_JOBS_SECRET ?? "";
}
