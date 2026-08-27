import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("../routers/consents", () => ({
  runEvidenceFreshnessRecheck: vi.fn(async () => ({ flagged: 0 })),
}));
vi.mock("../routers/supplierOps", () => ({
  runEvidenceExpiryScan: vi.fn(async () => ({ reminders: 0 })),
  runOverdueIncidentDeliveryScan: vi.fn(async () => ({ delivered: 0 })),
  runCommercialDocumentScanFollowup: vi.fn(async () => ({ followed: 0 })),
}));

import { registerScheduledJob, syntheticTaskUid } from "./scheduler";
import { InternalScheduler, isJobDue, type InternalJob } from "./internalScheduler";

const savedProvider = process.env.SCHEDULER_PROVIDER;
afterEach(() => {
  if (savedProvider === undefined) delete process.env.SCHEDULER_PROVIDER;
  else process.env.SCHEDULER_PROVIDER = savedProvider;
});

describe("scheduler activation seam", () => {
  it("internal provider returns a synthetic taskUid without any network call", async () => {
    process.env.SCHEDULER_PROVIDER = "internal";
    const result = await registerScheduledJob(
      {
        name: "consent-evidence-freshness-clinic-7",
        cron: "0 30 5 * * *",
        path: "/api/scheduled/consent-evidence-freshness",
      },
      ""
    );
    expect(result.taskUid).toBe(
      syntheticTaskUid("consent-evidence-freshness-clinic-7")
    );
    expect(result.taskUid).toBe("internal:consent-evidence-freshness-clinic-7");
  });

  it("manus provider (default) still routes to the heartbeat SDK (which fails loudly without Forge config)", async () => {
    delete process.env.SCHEDULER_PROVIDER;
    await expect(
      registerScheduledJob(
        { name: "x", cron: "0 0 5 * * *", path: "/api/scheduled/supplier-evidence-expiry" },
        ""
      )
    ).rejects.toThrow(/BUILT_IN_FORGE_API_URL/);
  });
});

describe("internal scheduler dueness (drift guard)", () => {
  const job = { hourUtc: 5, minuteUtc: 30 };

  it("is not due before the daily time", () => {
    expect(isJobDue(job, new Date("2026-08-28T05:29:00Z"), undefined)).toBe(false);
  });

  it("is due at/after the daily time when it has not run today", () => {
    expect(isJobDue(job, new Date("2026-08-28T05:30:00Z"), undefined)).toBe(true);
    // Drift guard: even hours later (missed ticks) it still fires.
    expect(isJobDue(job, new Date("2026-08-28T17:03:00Z"), "2026-08-27")).toBe(true);
  });

  it("runs at most once per UTC day", () => {
    expect(isJobDue(job, new Date("2026-08-28T06:00:00Z"), "2026-08-28")).toBe(false);
    expect(isJobDue(job, new Date("2026-08-29T05:31:00Z"), "2026-08-28")).toBe(true);
  });
});

describe("internal scheduler tick", () => {
  const makeJob = (overrides: Partial<InternalJob> = {}): InternalJob => ({
    key: "test-job",
    hourUtc: 5,
    minuteUtc: 0,
    listActivatedClinics: vi.fn(async () => [1, 2]),
    runForClinic: vi.fn(async () => ({ ok: true })),
    ...overrides,
  });

  it("runs the job once per activated clinic, then not again the same day", async () => {
    let now = new Date("2026-08-28T05:01:00Z");
    const job = makeJob();
    const scheduler = new InternalScheduler([job], () => now);
    const first = await scheduler.tick();
    expect(first.ran).toEqual([
      { job: "test-job", clinicId: 1 },
      { job: "test-job", clinicId: 2 },
    ]);
    const second = await scheduler.tick();
    expect(second.ran).toEqual([]);
    // Next day it fires again.
    now = new Date("2026-08-29T05:01:00Z");
    const third = await scheduler.tick();
    expect(third.ran).toHaveLength(2);
    expect(job.runForClinic).toHaveBeenCalledTimes(4);
  });

  it("a failing clinic does not stop the others and does not retrigger the day", async () => {
    const now = new Date("2026-08-28T05:01:00Z");
    const runForClinic = vi
      .fn()
      .mockRejectedValueOnce(new Error("clinic 1 exploded"))
      .mockResolvedValue({ ok: true });
    const job = makeJob({ runForClinic });
    const scheduler = new InternalScheduler([job], () => now);
    const first = await scheduler.tick();
    expect(first.ran).toEqual([{ job: "test-job", clinicId: 2 }]);
    const second = await scheduler.tick();
    expect(second.ran).toEqual([]);
  });

  it("does nothing before the scheduled time", async () => {
    const job = makeJob();
    const scheduler = new InternalScheduler(
      [job],
      () => new Date("2026-08-28T04:59:00Z")
    );
    expect((await scheduler.tick()).ran).toEqual([]);
    expect(job.listActivatedClinics).not.toHaveBeenCalled();
  });
});
