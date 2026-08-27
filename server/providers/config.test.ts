import { afterEach, describe, expect, it } from "vitest";
import {
  getAuthProvider,
  getSchedulerProvider,
  getScheduledJobsSecret,
  getStorageProvider,
} from "./config";

const KEYS = [
  "AUTH_PROVIDER",
  "STORAGE_PROVIDER",
  "SCHEDULER_PROVIDER",
  "SCHEDULED_JOBS_SECRET",
];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("provider selection (de-Manus seams)", () => {
  it("defaults to the Manus-era providers when env vars are unset", () => {
    delete process.env.AUTH_PROVIDER;
    delete process.env.STORAGE_PROVIDER;
    delete process.env.SCHEDULER_PROVIDER;
    expect(getAuthProvider()).toBe("manus");
    expect(getStorageProvider()).toBe("forge");
    expect(getSchedulerProvider()).toBe("manus");
  });

  it("treats empty string as unset (defaults hold)", () => {
    process.env.AUTH_PROVIDER = "";
    expect(getAuthProvider()).toBe("manus");
  });

  it("selects the standalone providers when flipped", () => {
    process.env.AUTH_PROVIDER = "local";
    process.env.STORAGE_PROVIDER = "s3";
    process.env.SCHEDULER_PROVIDER = "internal";
    expect(getAuthProvider()).toBe("local");
    expect(getStorageProvider()).toBe("s3");
    expect(getSchedulerProvider()).toBe("internal");
  });

  it("is case/whitespace tolerant", () => {
    process.env.AUTH_PROVIDER = " Local ";
    expect(getAuthProvider()).toBe("local");
  });

  it("rejects unknown provider names loudly (no silent fallback)", () => {
    process.env.AUTH_PROVIDER = "auth0";
    expect(() => getAuthProvider()).toThrow(/Invalid AUTH_PROVIDER/);
    process.env.STORAGE_PROVIDER = "gcs";
    expect(() => getStorageProvider()).toThrow(/Invalid STORAGE_PROVIDER/);
    process.env.SCHEDULER_PROVIDER = "quartz";
    expect(() => getSchedulerProvider()).toThrow(/Invalid SCHEDULER_PROVIDER/);
  });

  it("scheduled-jobs secret is empty by default", () => {
    delete process.env.SCHEDULED_JOBS_SECRET;
    expect(getScheduledJobsSecret()).toBe("");
    process.env.SCHEDULED_JOBS_SECRET = "s3cr3t";
    expect(getScheduledJobsSecret()).toBe("s3cr3t");
  });
});
