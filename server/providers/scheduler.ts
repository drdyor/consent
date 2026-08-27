// De-Manus scheduler seam (WINDOW_C4 Stage 3): SCHEDULER_PROVIDER=manus|internal.
//
// Activation wrapper used by the routers instead of calling the Manus heartbeat
// SDK directly. Default (manus) delegates to createHeartbeatJob exactly as
// before. `internal` registers nothing externally: it returns a synthetic
// taskUid ("internal:<job name>") that is persisted on the clinic's settings
// row — the in-process scheduler (internalScheduler.ts) treats any settings row
// with a non-null scheduleCronTaskUid as an activated schedule, and the
// /api/scheduled/* endpoints remain available to an external cron via
// SCHEDULED_JOBS_SECRET as an alternative.

import { createHeartbeatJob, type HeartbeatJob } from "../_core/heartbeat";
import { getSchedulerProvider } from "./config";

export const INTERNAL_TASK_UID_PREFIX = "internal:";

export function syntheticTaskUid(jobName: string): string {
  return `${INTERNAL_TASK_UID_PREFIX}${jobName}`;
}

export async function registerScheduledJob(
  job: HeartbeatJob,
  userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  if (getSchedulerProvider() === "internal") {
    return { taskUid: syntheticTaskUid(job.name), nextExecutionAt: null };
  }
  return createHeartbeatJob(job, userSession);
}
