// De-Manus scheduler seam (WINDOW_C4 Stage 3): SCHEDULER_PROVIDER=internal.
//
// In-process interval scheduler replacing the Manus heartbeat callbacks. A
// setInterval tick (default every 60s) recomputes "what is due" from the wall
// clock each time — the drift guard: a missed or slow tick is caught up on the
// next tick, and each job runs at most once per UTC day per clinic.
//
// The three scheduled jobs invoke EXACTLY the same functions the
// /api/scheduled/* endpoints call, per clinic that has the schedule activated
// (settings row with a non-null scheduleCronTaskUid). The Manus daily times
// are preserved: evidence expiry 05:00, incident escalations 05:15, consent
// evidence freshness 05:30 (UTC).

import { isNotNull } from "drizzle-orm";
import {
  consentEvidenceFreshnessSettings,
  supplierEscalationSettings,
  supplierReminderSettings,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { runEvidenceFreshnessRecheck } from "../routers/consents";
import {
  runCommercialDocumentScanFollowup,
  runEvidenceExpiryScan,
  runOverdueIncidentDeliveryScan,
} from "../routers/supplierOps";
import { getSchedulerProvider } from "./config";

export type InternalJob = {
  key: string;
  /** Daily run time, UTC. */
  hourUtc: number;
  minuteUtc: number;
  /** ClinicIds with this schedule activated. */
  listActivatedClinics: () => Promise<number[]>;
  /** The existing scheduled-job logic, invoked per clinic. */
  runForClinic: (clinicId: number) => Promise<unknown>;
};

async function activatedClinicIds(
  table:
    | typeof supplierReminderSettings
    | typeof supplierEscalationSettings
    | typeof consentEvidenceFreshnessSettings
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ clinicId: table.clinicId })
    .from(table)
    .where(isNotNull(table.scheduleCronTaskUid));
  return rows.map(r => r.clinicId);
}

export const INTERNAL_JOBS: InternalJob[] = [
  {
    key: "supplier-evidence-expiry",
    hourUtc: 5,
    minuteUtc: 0,
    listActivatedClinics: () => activatedClinicIds(supplierReminderSettings),
    runForClinic: clinicId => runEvidenceExpiryScan(clinicId),
  },
  {
    key: "supplier-incident-escalations",
    hourUtc: 5,
    minuteUtc: 15,
    listActivatedClinics: () => activatedClinicIds(supplierEscalationSettings),
    runForClinic: async clinicId => ({
      delivery: await runOverdueIncidentDeliveryScan(clinicId),
      scanFollowup: await runCommercialDocumentScanFollowup(clinicId),
    }),
  },
  {
    key: "consent-evidence-freshness",
    hourUtc: 5,
    minuteUtc: 30,
    listActivatedClinics: () =>
      activatedClinicIds(consentEvidenceFreshnessSettings),
    runForClinic: clinicId => runEvidenceFreshnessRecheck(clinicId),
  },
];

const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);

/** Pure dueness rule, exported for tests: run when the daily UTC time has
 * passed and the job has not yet run on this UTC day. */
export function isJobDue(
  job: Pick<InternalJob, "hourUtc" | "minuteUtc">,
  now: Date,
  lastRunDayKey: string | undefined
): boolean {
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutesDue = job.hourUtc * 60 + job.minuteUtc;
  return minutesNow >= minutesDue && lastRunDayKey !== utcDayKey(now);
}

export class InternalScheduler {
  private lastRunDay = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jobs: InternalJob[] = INTERNAL_JOBS,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** One drift-guarded pass; safe to call directly (used by tests). */
  async tick(): Promise<{ ran: { job: string; clinicId: number }[] }> {
    const ran: { job: string; clinicId: number }[] = [];
    const currentTime = this.now();
    for (const job of this.jobs) {
      if (!isJobDue(job, currentTime, this.lastRunDay.get(job.key))) continue;
      // Mark before running so a throwing clinic cannot retrigger the whole
      // job every minute for the rest of the day; failures are logged loudly.
      this.lastRunDay.set(job.key, utcDayKey(currentTime));
      let clinicIds: number[] = [];
      try {
        clinicIds = await job.listActivatedClinics();
      } catch (error) {
        console.error(
          `[InternalScheduler] ${job.key}: failed to list activated clinics`,
          error
        );
        continue;
      }
      for (const clinicId of clinicIds) {
        try {
          const result = await job.runForClinic(clinicId);
          ran.push({ job: job.key, clinicId });
          console.log(
            `[InternalScheduler] ${job.key} clinic=${clinicId} ok`,
            typeof result === "object" ? JSON.stringify(result).slice(0, 300) : result
          );
        } catch (error) {
          console.error(
            `[InternalScheduler] ${job.key} clinic=${clinicId} FAILED`,
            error
          );
        }
      }
    }
    return { ran };
  }

  start(tickMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, tickMs);
    // Never keep the process alive just for the scheduler.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

let running: InternalScheduler | null = null;

/** Boot hook: starts the in-process scheduler when SCHEDULER_PROVIDER=internal.
 * No-op otherwise (Manus heartbeat remains the default). */
export function startInternalSchedulerIfConfigured(): InternalScheduler | null {
  if (getSchedulerProvider() !== "internal") return null;
  if (running) return running;
  const tickMs = Math.max(
    5_000,
    Number(process.env.INTERNAL_SCHEDULER_TICK_MS ?? 60_000) || 60_000
  );
  running = new InternalScheduler();
  running.start(tickMs);
  console.log(
    `[InternalScheduler] started (tick ${tickMs} ms; jobs: ${INTERNAL_JOBS.map(j => j.key).join(", ")})`
  );
  return running;
}
